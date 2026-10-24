import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/e2e/env';
import { PROXY_URL } from './tests/e2e/admin/env';

/**
 * One Playwright project per e2e area. Needs a built site: `pnpm build && pnpm test:e2e`.
 * - `desktop` / `mobile` (L6 forms): wrangler pages dev with the real Functions, a local D1 and
 *   tools/mock-mail, booted by tests/e2e/global-setup.ts. Ports: E2E_PORT, MOCK_MAIL_PORT.
 * - `admin` (L7): tests/e2e/admin/stack.mjs behind the dev Access proxy, serial (one shared D1).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/admin/**',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'mobile',
      testIgnore: '**/admin/**',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], baseURL: BASE_URL, viewport: { width: 360, height: 740 } },
    },
    {
      name: 'admin',
      testDir: './tests/e2e/admin',
      fullyParallel: false,
      use: { baseURL: PROXY_URL, browserName: 'chromium', viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/admin/stack.mjs',
      url: `${PROXY_URL}/admin/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
