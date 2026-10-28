/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Phase 1 supports only "test". Any other value disables trial activation. */
  readonly VITE_BILLING_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
