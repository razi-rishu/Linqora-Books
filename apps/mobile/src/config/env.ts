/**
 * Build-time environment. Phase 1 is a local prototype: there is no backend, no
 * real authentication and no payment provider. These flags exist so that the UI
 * can say so plainly on every screen.
 */
export const APP_VERSION = '0.1.0';

export const BILLING_MODE: 'test' | 'unavailable' = (import.meta.env.VITE_BILLING_MODE ?? 'test') === 'test' ? 'test' : 'unavailable';

export const DATA_BACKEND = 'local-device' as const;

export const IS_PROTOTYPE = true;
