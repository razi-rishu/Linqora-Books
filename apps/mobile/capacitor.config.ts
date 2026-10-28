import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Linqora Books is a separate app from Linqora QR (com.linqora.app).
 * It has its own application ID, signing key and version numbers.
 */
const config: CapacitorConfig = {
  appId: 'com.linqora.books',
  appName: 'Linqora Books',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
