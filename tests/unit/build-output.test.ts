/**
 * Builds the site into a temporary directory and checks the rendered output of
 * Base.astro and the stub pages (things the container API cannot render, because
 * Base reads the settings content collection).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { STUB_KEYS } from '../../src/components/site/stubs';
import { localePath } from '../../src/i18n/routes';

const SITE = 'https://example.test';
// Astro renames assets into outDir, so it must be on the repo's filesystem (gitignored).
const TMP = 'node_modules/.cache/l2-build-test';
mkdirSync(TMP, { recursive: true });
// Vitest exports DEV/PROD/MODE/NODE_ENV/VITEST*; a real build must not inherit them.
const LEAKY = /^(DEV|PROD|MODE|SSR|BASE_URL|NODE_ENV|TEST|VITEST.*)$/;
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !LEAKY.test(k)));
const astro = (outDir: string, env: Record<string, string>) =>
  spawnSync('node_modules/.bin/astro', ['build', '--outDir', outDir], {
    env: { ...cleanEnv(), SITE_URL: SITE, ...env },
    encoding: 'utf8',
  });

let out = '';
const page = (path: string) => readFileSync(join(out, path, 'index.html'), 'utf8');

beforeAll(() => {
  out = mkdtempSync(join(TMP, 'out-'));
  const r = astro(out, { PUBLIC_NOINDEX: 'false', CONTENT_STRICT: '', DEV_PAGES: '' });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
}, 120_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('Base head', () => {
  it('omits noindex on real pages when PUBLIC_NOINDEX=false', () => {
    expect(page('sk')).not.toContain('name="robots"');
  });

  it('emits a self canonical and sk/cs/en/x-default alternates', () => {
    const html = page('cs');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/cs/">`);
    for (const [lang, path] of [
      ['sk', '/sk/'],
      ['cs', '/cs/'],
      ['en', '/en/'],
      ['x-default', '/sk/'],
    ])
      expect(html).toContain(`<link rel="alternate" hreflang="${lang}" href="${SITE}${path}">`);
  });

  it('sets html lang, the skip link target and font preloads from hashed assets', () => {
    const html = page('en');
    expect(html).toMatch(/<html lang="en"/);
    expect(html).toContain('<main id="main" tabindex="-1">');
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(
      (m) => m[1],
    );
    expect(preloads).toHaveLength(2);
    for (const p of preloads) expect(p).toMatch(/^\/_astro\/[\w-]+\.[\w-]{8}\.woff2$/);
  });

  it('references only fonts that exist in the build', () => {
    const css = readdirSync(join(out, '_astro')).filter((f) => f.endsWith('.css'));
    const urls = css.flatMap((f) =>
      [...readFileSync(join(out, '_astro', f), 'utf8').matchAll(/url\(([^)]+\.woff2)\)/g)].map(
        (m) => m[1],
      ),
    );
    expect(urls.length).toBe(3);
    const files = new Set(readdirSync(join(out, '_astro')).map((f) => `/_astro/${f}`));
    for (const u of urls) expect(files.has(u.replace(/["']/g, ''))).toBe(true);
    expect(readdirSync(out)).not.toContain('dev');
  });
});

describe('stub pages', () => {
  it('stay noindex and carry data-stub on <main> even with PUBLIC_NOINDEX=false', () => {
    for (const key of STUB_KEYS) {
      const html = page(localePath(key, 'sk').slice(1, -1));
      expect(html, key).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html, key).toMatch(/<main id="main" tabindex="-1" data-stub(="[^"]*")?>/);
    }
  });

  it('are not marked on real pages', () => {
    expect(page('sk')).not.toContain('data-stub');
  });
});

describe('strict build', () => {
  it('fails while the brand name is not verified', () => {
    const dir = mkdtempSync(join(TMP, 'strict-'));
    try {
      const r = astro(dir, { CONTENT_STRICT: '1', DEV_PAGES: '' });
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/CONTENT_STRICT=1: needs-review settings\.brandName/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
