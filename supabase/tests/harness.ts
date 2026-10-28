/**
 * Runs the real migrations in an embedded PostgreSQL (PGlite) with a minimal
 * stand-in for the parts of Supabase they rely on: the auth schema / auth.uid(),
 * the anon / authenticated / service_role roles with Supabase's default grants,
 * and the storage schema. Queries can then be executed AS a given user, so RLS,
 * grants and triggers are exercised exactly as PostgREST would.
 *
 * This is NOT the hosted Supabase project; see docs/SUPABASE_SETUP.md for the
 * cloud checks that must still be run once the project exists.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

const SUPABASE_STUB = /* sql */ `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants everything on public objects to these roles by default; RLS and
-- the migrations' own revokes are what actually protect the data.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
`;

export type Role = { kind: 'anon' } | { kind: 'user'; id: string } | { kind: 'service' };

export class TestDb {
  private constructor(readonly pg: PGlite) {}

  static async create(): Promise<TestDb> {
    const pg = await PGlite.create();
    await pg.exec(SUPABASE_STUB);
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      try {
        await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
      } catch (e) {
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`, { cause: e });
      }
    }
    return new TestDb(pg);
  }

  /** Creates an auth user (as Supabase Auth would on sign-up). */
  async createUser(email: string, { confirmed = true, name = '' } = {}): Promise<string> {
    const id = crypto.randomUUID();
    await this.pg.query(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`,
      [id, email, confirmed ? new Date().toISOString() : null, JSON.stringify({ display_name: name })],
    );
    return id;
  }

  /** Runs a statement as the given role inside its own transaction, like one PostgREST request. */
  async as<T = Record<string, unknown>>(role: Role, sql: string, params: unknown[] = []): Promise<T[]> {
    return this.pg.transaction(async (tx) => {
      if (role.kind === 'user') {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [role.id]);
        await tx.exec('set local role authenticated');
      } else if (role.kind === 'anon') {
        await tx.exec(`select set_config('request.jwt.claim.sub', '', true); set local role anon`);
      } else {
        await tx.exec('set local role service_role');
      }
      const result = await tx.query<T>(sql, params);
      return result.rows;
    });
  }

  /** Runs SQL as the database owner (setup only — bypasses RLS). */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }
}

export const user = (id: string): Role => ({ kind: 'user', id });
export const anon: Role = { kind: 'anon' };
export const service: Role = { kind: 'service' };

/** Expects a promise to be rejected with a message matching `pattern`. */
export async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const message = (e as Error).message;
    if (!pattern.test(message)) throw new Error(`Expected error matching ${pattern}, got: ${message}`, { cause: e });
    return;
  }
  throw new Error(`Expected rejection matching ${pattern}, but it succeeded`);
}
