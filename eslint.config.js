import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

const serverOnly = {
  group: ['**/server/**', '**/server'],
  message: 'src/server/** is server-only (islands, components and shared must not import it).',
};

export default [
  { ignores: ['dist/', '.astro/', 'node_modules/', 'seed/', 'pnpm-lock.yaml'] },
  { languageOptions: { globals: { ...globals.node } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['src/islands/**', 'src/components/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [serverOnly] }] },
  },
  {
    // shared imports nothing from the app; zod / zod/mini only.
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            serverOnly,
            {
              group: [
                '**/islands/**',
                '**/components/**',
                '**/layouts/**',
                '**/pages/**',
                '**/i18n/**',
                '**/content/**',
              ],
              message: 'src/shared/** must not import from the rest of the app.',
            },
          ],
        },
      ],
    },
  },
  {
    // functions import only src/server and src/shared (checked via path shape).
    files: ['functions/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/src/islands/**',
                '**/src/components/**',
                '**/src/layouts/**',
                '**/src/pages/**',
                '**/src/i18n/**',
              ],
              message: 'functions/** may import only src/server/** and src/shared/**.',
            },
          ],
        },
      ],
    },
  },
];
