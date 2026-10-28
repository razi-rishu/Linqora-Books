/**
 * Linqora Books API — Cloudflare Worker SKELETON (Phase 1).
 *
 * Not deployed and has no wrangler config yet. It shows the intended shape:
 * - Every request is authenticated with the user's Supabase JWT (Phase 2).
 * - Entitlements are decided here, from verified billing-provider data (Phase 5),
 *   never from anything the client claims.
 * - The Supabase service-role key exists only as a Worker secret, never in app code.
 */
import { evaluateAccess, NO_ENTITLEMENT, type AccessDecision } from '@linqora-books/billing';

export interface Env {
  /** Phase 2: Supabase project URL. */
  SUPABASE_URL?: string;
  /** Phase 2: Worker secret, set with `wrangler secret put`. Never shipped to clients. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleRequest(request: Request, env: Env, today: string): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'linqora-books-api', phase: 1, configured: Boolean(env.SUPABASE_URL) });
  }

  if (url.pathname.startsWith('/v1/')) {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    // Phase 2: verify the JWT with Supabase and resolve the user's organization membership.
    if (!env.SUPABASE_URL) return json({ error: 'not_configured', message: 'Backend is not configured in Phase 1' }, 503);
  }

  if (request.method === 'GET' && url.pathname === '/v1/entitlement') {
    // Phase 5: load the organization's verified entitlement from the database.
    const decision: AccessDecision = evaluateAccess(NO_ENTITLEMENT, today);
    return json({ entitlement: NO_ENTITLEMENT, access: decision });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, new Date().toISOString().slice(0, 10));
  },
};
