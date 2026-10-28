import { defineConfig, devices } from '@playwright/test';

/** Smoke tests against the production build served by `vite preview`. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    // E2E exercises the explicit local preview build (no cloud project needed).
    command: 'pnpm build:preview && pnpm preview',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
