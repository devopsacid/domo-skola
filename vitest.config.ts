/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig lets component tests render .astro files with the container API.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // The default 5 s is too short for the tests that build or scan the whole tree (lint-boundaries, checkers).
    testTimeout: 30_000,
  },
});
