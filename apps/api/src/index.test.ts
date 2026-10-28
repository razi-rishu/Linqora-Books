import { describe, expect, it } from 'vitest';
import { handleRequest } from './index';

const today = '2026-10-28';

describe('api skeleton', () => {
  it('reports health', async () => {
    const res = await handleRequest(new Request('https://api.test/health'), {}, today);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, configured: false });
  });

  it('requires a bearer token for /v1 routes', async () => {
    const res = await handleRequest(new Request('https://api.test/v1/entitlement'), {}, today);
    expect(res.status).toBe(401);
  });

  it('refuses to serve data while unconfigured', async () => {
    const res = await handleRequest(new Request('https://api.test/v1/entitlement', { headers: { authorization: 'Bearer x' } }), {}, today);
    expect(res.status).toBe(503);
  });
});
