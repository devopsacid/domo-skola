import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// Lints in-memory snippets as if they lived at a given repo path, so no fixture files
// exist that the normal `eslint .` run could trip over.
const eslint = new ESLint({ cwd: process.cwd() });

async function violations(filePath: string, code: string) {
  const [res] = await eslint.lintText(code, { filePath });
  return res!.messages.filter((m) => m.ruleId === 'local/import-allowlist').length;
}

const bad: [string, string, string][] = [
  ['shared imports astro', 'src/shared/a.ts', "import { z } from 'astro/zod';"],
  ['shared imports content-schemas', 'src/shared/a.ts', "import x from '../content-schemas';"],
  ['shared imports other npm', 'src/shared/a.ts', "import x from 'lodash';"],
  ['shared imports server', 'src/shared/a.ts', "import x from '../server/db/x';"],
  ['shared dynamic import', 'src/shared/a.ts', "const m = await import('astro');"],
  ['shared re-export', 'src/shared/a.ts', "export * from '../i18n/routes';"],
  ['functions import islands', 'functions/api/x.ts', "import x from '../../src/islands/F';"],
  ['functions import npm', 'functions/api/x.ts', "import x from 'zod';"],
  [
    'functions dynamic import',
    'functions/api/x.ts',
    "const m = await import('../../src/i18n/routes');",
  ],
  ['server imports components', 'src/server/h.ts', "import x from '../components/A.astro';"],
  ['server imports layouts', 'src/server/h.ts', "import x from '../layouts/L.astro';"],
  ['server imports pages dynamically', 'src/server/h.ts', "await import('../pages/x');"],
  ['islands import server', 'src/islands/F.ts', "import x from '../server/db/x';"],
  ['components import server', 'src/components/C.ts', "import x from '../server/db/x';"],
];

const good: [string, string, string][] = [
  ['shared imports zod/mini', 'src/shared/a.ts', "import * as z from 'zod/mini';"],
  ['shared imports zod', 'src/shared/a.ts', "import { z } from 'zod';"],
  ['shared imports sibling', 'src/shared/schemas/a.ts', "import { X } from '../enums';"],
  [
    'functions import server and shared',
    'functions/api/x.ts',
    "import a from '../../src/server/h'; import b from '../../src/shared/enums';",
  ],
  [
    'functions import workers types',
    'functions/api/x.ts',
    "import type { PagesFunction } from '@cloudflare/workers-types';",
  ],
  ['server imports shared', 'src/server/h.ts', "import b from '../shared/enums';"],
  ['islands import shared', 'src/islands/F.ts', "import b from '../shared/enums';"],
];

describe('ESLint import boundaries (negative)', () => {
  for (const [name, path, code] of bad)
    // The first lintText loads the whole flat config; on a busy machine that alone can pass 5 s.
    it(`rejects: ${name}`, async () => {
      expect(await violations(path, code)).toBeGreaterThan(0);
    }, 30_000);
});

describe('ESLint import boundaries (positive)', () => {
  for (const [name, path, code] of good)
    it(`allows: ${name}`, async () => {
      expect(await violations(path, code)).toBe(0);
    }, 30_000);
});
