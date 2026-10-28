import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudError, toCloudError, type CloudGateway, type CloudTable } from '@linqora-books/cloud';

/** CloudGateway over supabase-js (PostgREST + Storage). Every call carries the user's JWT. */
export class SupabaseGateway implements CloudGateway {
  constructor(private readonly sb: SupabaseClient) {}

  async currentUserId(): Promise<string | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async selectRows<T>(table: CloudTable, match: Record<string, string>): Promise<T[]> {
    const { data, error } = await this.sb.from(table).select('*').match(match);
    if (error) throw toCloudError(error);
    return (data ?? []) as T[];
  }

  async insertRow(table: CloudTable, row: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb.from(table).insert(row);
    if (error) throw toCloudError(error);
  }

  async updateRows(table: CloudTable, match: Record<string, string>, patch: Record<string, unknown>): Promise<number> {
    const { data, error } = await this.sb.from(table).update(patch).match(match).select();
    if (error) throw toCloudError(error);
    return data?.length ?? 0;
  }

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw toCloudError(error);
    return data as T;
  }

  async uploadFile(bucket: string, path: string, data: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.sb.storage.from(bucket).upload(path, data, { contentType, upsert: true });
    if (error) throw new CloudError('unknown', `Upload failed: ${error.message}`);
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string | null> {
    const { data, error } = await this.sb.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    return error ? null : data.signedUrl;
  }
}
