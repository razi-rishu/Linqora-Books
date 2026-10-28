import { describe, expect, it } from 'vitest';
import { assertPublishableKey, ConfigurationError, resolveDataMode } from './env';

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.signature`;

describe('build configuration', () => {
  it('uses the cloud only with a Supabase URL and publishable key', () => {
    expect(resolveDataMode({ VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' })).toBe('cloud');
  });

  it('local preview must be enabled explicitly; otherwise the build is unconfigured (no mock sign-in)', () => {
    expect(resolveDataMode({})).toBe('unconfigured');
    expect(resolveDataMode({ VITE_ALLOW_LOCAL_PREVIEW: 'true' })).toBe('local-preview');
    expect(resolveDataMode({ VITE_ALLOW_LOCAL_PREVIEW: 'yes' })).toBe('unconfigured');
  });

  it('never runs local preview when cloud is configured', () => {
    expect(
      resolveDataMode({ VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1', VITE_ALLOW_LOCAL_PREVIEW: 'true' }),
    ).toBe('cloud');
  });

  it('refuses secret and service-role keys so they can never ship in the app', () => {
    expect(() => assertPublishableKey('sb_secret_abc123')).toThrow(ConfigurationError);
    expect(() => assertPublishableKey(jwt({ role: 'service_role', iss: 'supabase' }))).toThrow(/service_role/);
    expect(() => assertPublishableKey(jwt({ role: 'anon', iss: 'supabase' }))).not.toThrow();
    expect(() => assertPublishableKey('sb_publishable_abc')).not.toThrow();
  });

  it('rejects URLs that are not a Supabase project', () => {
    expect(() => resolveDataMode({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1' })).toThrow(ConfigurationError);
  });
});
