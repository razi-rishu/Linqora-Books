import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config/env';
import { sessionStorageForPlatform } from './secure-storage';

let client: SupabaseClient | null = null;

/**
 * The single Supabase client (publishable key + the user's session; RLS applies).
 * PKCE flow: e-mail links come back with a one-time code that only this device can
 * exchange, via the com.linqora.books:// deep link (see auth/auth-controller).
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: sessionStorageForPlatform(),
        storageKey: 'linqora-books-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return client;
}
