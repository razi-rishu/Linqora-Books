import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

interface PreferencesState {
  theme: ThemePreference;
  setTheme(theme: ThemePreference): void;
}

export const usePreferences = create<PreferencesState>()(
  persist((set) => ({ theme: 'system', setTheme: (theme) => set({ theme }) }), {
    name: 'linqora-books:preferences:v1',
    storage: createJSONStorage(() => localStorage),
  }),
);

export function applyTheme(theme: ThemePreference): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', Boolean(dark));
}
