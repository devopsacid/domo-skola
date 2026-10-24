import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

import local from './eslint-rules/import-allowlist.js';

export default [
  { ignores: ['dist/', '.astro/', 'node_modules/', 'seed/', 'pnpm-lock.yaml'] },
  { languageOptions: { globals: { ...globals.node } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  { plugins: { local } },
  {
    files: ['src/islands/**', 'src/components/**'],
    rules: { 'local/import-allowlist': ['error', { denyDirs: ['src/server'] }] },
  },
  {
    files: ['src/server/**'],
    rules: {
      'local/import-allowlist': [
        'error',
        { denyDirs: ['src/islands', 'src/components', 'src/pages', 'src/layouts'] },
      ],
    },
  },
  {
    // Allowlist: relative shared files, zod and zod/mini only. The `zod` dependency exists
    // for src/shared/schemas; astro/zod stays in src/content-schemas.ts and content.config.ts.
    files: ['src/shared/**'],
    rules: {
      'local/import-allowlist': [
        'error',
        { allowDirs: ['src/shared'], allowBare: ['zod', 'zod/mini'] },
      ],
    },
  },
  {
    // Allowlist: src/server, src/shared, own files and the Workers types.
    files: ['functions/**'],
    rules: {
      'local/import-allowlist': [
        'error',
        {
          allowDirs: ['src/server', 'src/shared', 'functions'],
          allowBare: ['@cloudflare/workers-types'],
        },
      ],
    },
  },
];
