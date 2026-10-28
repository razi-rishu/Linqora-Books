/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dedicated Linqora Books Supabase project URL, e.g. https://abcd.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (anon) key ONLY. Secret/service-role keys are rejected at startup. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** "true" enables the on-device local preview when Supabase is not configured. */
  readonly VITE_ALLOW_LOCAL_PREVIEW?: string;
  /** Local preview only: "test" enables the TEST MODE trial. */
  readonly VITE_BILLING_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
