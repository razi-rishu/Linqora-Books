import { toCloudError, type CloudGateway, type CloudTable } from '@linqora-books/cloud';
import { anon, user, type TestDb } from './harness';

const SAFE = /^[a-z_]+$/;
function ident(name: string): string {
  if (!SAFE.test(name)) throw new Error(`Unsafe identifier ${name}`);
  return name;
}

/**
 * CloudGateway backed by embedded Postgres, acting as one signed-in user — the
 * same contract the app's supabase-js gateway fulfils against PostgREST.
 */
export class PgliteGateway implements CloudGateway {
  constructor(
    private readonly db: TestDb,
    private readonly uid: string | null,
  ) {}

  private get role() {
    return this.uid ? user(this.uid) : anon;
  }

  private async run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      return await this.db.as<T>(this.role, sql, params);
    } catch (e) {
      throw toCloudError(e as Error);
    }
  }

  async currentUserId() {
    return this.uid;
  }

  async selectRows<T>(table: CloudTable, match: Record<string, string>): Promise<T[]> {
    const keys = Object.keys(match).map(ident);
    const where = keys.length ? `where ${keys.map((k, i) => `t.${k}::text = $${i + 1}`).join(' and ')}` : '';
    const rows = await this.run<{ r: T }>(`select to_jsonb(t) as r from public.${ident(table)} t ${where}`, Object.values(match));
    return rows.map((x) => x.r);
  }

  async insertRow(table: CloudTable, row: Record<string, unknown>): Promise<void> {
    const cols = Object.keys(row).map(ident).join(', ');
    await this.run(`insert into public.${ident(table)} (${cols}) select ${cols} from jsonb_populate_record(null::public.${ident(table)}, $1)`, [
      JSON.stringify(row),
    ]);
  }

  async updateRows(table: CloudTable, match: Record<string, string>, patch: Record<string, unknown>): Promise<number> {
    const cols = Object.keys(patch).map(ident);
    if (!cols.length) return 0;
    const keys = Object.keys(match).map(ident);
    const where = keys.map((k, i) => `t.${k}::text = $${i + 2}`).join(' and ');
    const rows = await this.run(
      `update public.${ident(table)} t set (${cols.join(', ')}) = (select ${cols.map((c) => `p.${c}`).join(', ')}
         from jsonb_populate_record(null::public.${ident(table)}, $1) p) where ${where} returning 1`,
      [JSON.stringify(patch), ...Object.values(match)],
    );
    return rows.length;
  }

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const keys = Object.keys(args).map(ident);
    const params = Object.values(args).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
    const casts = Object.values(args).map((v) => (v !== null && typeof v === 'object' ? '::jsonb' : ''));
    const rows = await this.run<{ r: T }>(
      `select public.${ident(fn)}(${keys.map((k, i) => `${k} => $${i + 1}${casts[i]}`).join(', ')}) as r`,
      params,
    );
    return rows[0]!.r;
  }

  async uploadFile(bucket: string, path: string): Promise<void> {
    await this.run(`insert into storage.objects (bucket_id, name) values ($1, $2) on conflict (bucket_id, name) do nothing`, [bucket, path]);
  }

  async signedUrl(bucket: string, path: string): Promise<string | null> {
    const rows = await this.run(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, path]);
    return rows.length ? `https://signed.test/${bucket}/${path}` : null;
  }
}
