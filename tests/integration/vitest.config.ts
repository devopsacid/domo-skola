import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests run the real handlers against a real local D1 (workerd/Miniflare through
// wrangler's getPlatformProxy) with migrations/ applied by `wrangler d1 migrations apply --local`.
// @cloudflare/vitest-pool-workers is not used: every release declares a vitest ^4 peer, the repo is on vitest 5.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
