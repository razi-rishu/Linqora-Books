import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/** The storage contract Supabase Auth uses for the session (access + refresh tokens). */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let prefixReady: Promise<void> | null = null;
function ready(): Promise<void> {
  prefixReady ??= SecureStorage.setKeyPrefix('linqora-books.');
  return prefixReady;
}

/**
 * Android: encrypted with a key held in the Android Keystore; iOS: the Keychain.
 * Never written to Android backups (allowBackup=false + data-extraction rules).
 */
const nativeSecureStorage: SessionStorage = {
  async getItem(key) {
    await ready();
    return SecureStorage.getItem(key);
  },
  async setItem(key, value) {
    await ready();
    await SecureStorage.setItem(key, value);
  },
  async removeItem(key) {
    await ready();
    await SecureStorage.removeItem(key);
  },
};

/** Browser builds (development only) fall back to localStorage. */
const browserStorage: SessionStorage = {
  async getItem(key) {
    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    window.localStorage.removeItem(key);
  },
};

export function sessionStorageForPlatform(): SessionStorage {
  return Capacitor.isNativePlatform() ? nativeSecureStorage : browserStorage;
}
