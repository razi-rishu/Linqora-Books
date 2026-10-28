/**
 * Build-time environment.
 *
 * DATA MODES (decided at build time, never at run time by the user):
 * - cloud          VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY are set → real
 *                  Supabase Auth and the dedicated Linqora Books database.
 * - local-preview  VITE_ALLOW_LOCAL_PREVIEW=true and no Supabase config → the Phase 1
 *                  on-device prototype with its local-only sign-in, clearly labelled.
 *                  Never combined with cloud mode; never the default.
 * - unconfigured   neither → the app explains it is not configured. No mock sign-in.
 */
export const APP_VERSION = '0.2.0';

export type DataMode = 'cloud' | 'local-preview' | 'unconfigured';

export interface PublicEnv {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  VITE_ALLOW_LOCAL_PREVIEW?: string | undefined;
  VITE_BILLING_MODE?: string | undefined;
}

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

/**
 * Only the publishable (or legacy anon) key may ship in the app. Secret and
 * service-role keys bypass Row Level Security and must never reach a device.
 */
export function assertPublishableKey(key: string): void {
  if (/^sb_secret_/i.test(key)) throw new ConfigurationError('A Supabase SECRET key was configured. Use the publishable key.');
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
      if (payload.role && payload.role !== 'anon') {
        throw new ConfigurationError(`A Supabase "${payload.role}" key was configured. Only the publishable/anon key is allowed.`);
      }
    } catch (e) {
      if (e instanceof ConfigurationError) throw e;
    }
  }
}

export function resolveDataMode(env: PublicEnv): DataMode {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url && key) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
      throw new ConfigurationError(`VITE_SUPABASE_URL "${url}" is not a Supabase project URL`);
    }
    assertPublishableKey(key);
    return 'cloud';
  }
  return env.VITE_ALLOW_LOCAL_PREVIEW === 'true' ? 'local-preview' : 'unconfigured';
}

const env = import.meta.env as unknown as PublicEnv;

export const DATA_MODE: DataMode = resolveDataMode(env);
export const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

/** Phase 1 local preview supports only "test" billing; cloud billing is disabled in Phase 2. */
export const BILLING_MODE: 'test' | 'unavailable' =
  DATA_MODE === 'local-preview' && (env.VITE_BILLING_MODE ?? 'test') === 'test' ? 'test' : 'unavailable';

/** Where Supabase Auth e-mail links return to inside the Android/iOS app. */
export const NATIVE_AUTH_CALLBACK = 'com.linqora.books://auth/callback';

export const IS_PROTOTYPE = DATA_MODE !== 'cloud';
