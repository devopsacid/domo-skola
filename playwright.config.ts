import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/env';

/**
 * e2e against the built site (`dist/`) served by `wrangler pages dev` with the real Functions, a local D1
 * and tools/mock-mail (tests/e2e/global-setup.ts). Run `pnpm build` first. Ports: E2E_PORT, MOCK_MAIL_PORT.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } },
    },
  ],
});
