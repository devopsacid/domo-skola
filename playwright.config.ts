import { defineConfig } from '@playwright/test';
import { PROXY_URL } from './tests/e2e/admin/env';

/**
 * One Playwright project per e2e area, so lanes add theirs without touching each other:
 * `admin` (L7) runs against tests/e2e/admin/stack.mjs; the forms lane adds `forms` the same way.
 * Needs a built site: `pnpm build && pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'admin',
      testDir: './tests/e2e/admin',
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
