/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig lets component tests render .astro files with the container API.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
