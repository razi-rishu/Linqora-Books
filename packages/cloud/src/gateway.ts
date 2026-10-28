/**
 * The small set of database operations the cloud repository needs. The app
 * implements it with supabase-js (apps/mobile/src/cloud/supabase-gateway.ts);
 * the database tests implement it with embedded Postgres, so the repository is
 * tested against the real schema, RLS and triggers.
 */
export type CloudTable =
  | 'organizations'
  | 'organization_members'
  | 'business_settings'
  | 'entitlements'
  | 'categories'
  | 'contacts'
  | 'money_accounts'
  | 'projects'
  | 'documents'
  | 'transactions'
  | 'data_imports';

export interface CloudGateway {
  /** The signed-in user's id, or null. */
  currentUserId(): Promise<string | null>;
  /** Rows matching all column = value pairs (RLS applies). */
  selectRows<T>(table: CloudTable, match: Record<string, string>): Promise<T[]>;
  /** Inserts one row. Throws CloudError('duplicate') if the primary key exists. */
  insertRow(table: CloudTable, row: Record<string, unknown>): Promise<void>;
  /** Updates matching rows; returns how many were changed (0 = none visible/allowed). */
  updateRows(table: CloudTable, match: Record<string, string>, patch: Record<string, unknown>): Promise<number>;
  /** Calls a database function (RPC) with named arguments. */
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
  /** Uploads (or replaces) a private file. */
  uploadFile(bucket: string, path: string, data: Uint8Array, contentType: string): Promise<void>;
  /** Short-lived signed URL for a private file, or null if it is not accessible. */
  signedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string | null>;
}

export type CloudErrorKind = 'network' | 'auth' | 'permission' | 'duplicate' | 'validation' | 'not-found' | 'unknown';

/** A failure the app can explain to the user. `message` is safe to show. */
export class CloudError extends Error {
  override name = 'CloudError';
  constructor(
    readonly kind: CloudErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const NETWORK_PATTERNS = [/failed to fetch/i, /network ?error/i, /network request failed/i, /load failed/i, /fetch failed/i, /timed? ?out/i];

/** Maps a PostgreSQL / PostgREST error to a CloudError with a user-facing message. */
export function toCloudError(input: { code?: string; message?: string; status?: number } | Error): CloudError {
  if (input instanceof CloudError) return input;
  const message = input.message ?? 'Unknown error';
  const code = 'code' in input ? (input.code as string | undefined) : undefined;
  if (NETWORK_PATTERNS.some((p) => p.test(message))) {
    return new CloudError('network', 'Could not reach the server. Nothing was saved — check your connection and try again.', code);
  }
  switch (code) {
    case '23505':
      return new CloudError('duplicate', 'This record already exists.', code);
    case '42501':
      return new CloudError('permission', 'You do not have permission to do that, or your access is not active.', code);
    case 'P0001': // raise exception in our triggers/functions: already user-facing
      return new CloudError('validation', message, code);
    case '23503':
      return new CloudError('validation', 'A linked record does not exist in this business.', code);
    case '23514':
      return new CloudError('validation', 'Some details are not valid for this record.', code);
    case 'PGRST301':
    case '401':
      return new CloudError('auth', 'Your session has expired. Please sign in again.', code);
    default:
      if ('status' in input && input.status === 401) return new CloudError('auth', 'Your session has expired. Please sign in again.', code);
      return new CloudError('unknown', message, code);
  }
}
