/**
 * Builds the site into a temporary directory and checks the rendered output of
 * Base.astro and the content pages (things the container API cannot render, because
 * Base reads the settings content collection).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, PAGE_KEYS, localePath } from '../../src/i18n/routes';

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

/** Every built HTML file below `dir`, as paths relative to `out`. */
const htmlFiles = (dir = ''): string[] =>
  readdirSync(join(out, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(join(dir, e.name))
      : e.name.endsWith('.html')
        ? [join(dir, e.name)]
        : [],
  );
const at = (key: (typeof PAGE_KEYS)[number], l: (typeof LOCALES)[number]) =>
  page(localePath(key, l).slice(1, -1));

describe('content pages (L4)', () => {
  it('build every page key in every locale, and no stub page is left', () => {
    for (const key of PAGE_KEYS.filter((k) => k !== 'post'))
      for (const l of LOCALES) expect(at(key, l), `${key}:${l}`).toContain('<main id="main"');
    for (const f of htmlFiles()) expect(readFileSync(join(out, f), 'utf8'), f).not.toContain('data-stub');
  });

  it('render one h1 per page', () => {
    for (const key of ['approach', 'day', 'parents', 'faq', 'blog', 'privacy', 'cookies', 'legal'] as const)
      for (const l of LOCALES) expect(at(key, l).match(/<h1[\s>]/g), `${key}:${l}`).toHaveLength(1);
  });

  it('show the owner themes and the what-we-do-not-claim block on approach', () => {
    const ids = {
      sk: ['ako-pracujeme', 'male-skupiny', 'sprievodca', 'cas-vonku', 'rodicia-ako-partneri', 'co-netvrdime'],
      cs: ['jak-pracujeme', 'male-skupiny', 'pruvodce', 'cas-venku', 'rodice-jako-partneri', 'co-netvrdime'],
      en: ['how-we-work', 'small-groups', 'guide', 'time-outdoors', 'parents-as-partners', 'what-we-do-not-claim'],
    };
    for (const l of LOCALES) {
      const html = at('approach', l);
      for (const id of ids[l]) expect(html, `${l}#${id}`).toContain(`id="${id}"`);
    }
  });

  it('keep every in-page link from approach and FAQ to parents resolvable', () => {
    for (const l of LOCALES) {
      const parents = at('parents', l);
      const prefix = localePath('parents', l);
      for (const src of [at('approach', l), at('faq', l)])
        for (const m of src.matchAll(new RegExp(`href="${prefix}#([^"]+)"`, 'g')))
          expect(parents, `${l} #${m[1]}`).toContain(`id="${m[1]}"`);
    }
  });

  it('never state a legal model while settings.legalModel is unverified', () => {
    const pending = { sk: 'Právny model upresníme', cs: 'Právní model upřesníme', en: 'We will set out our legal model' };
    for (const l of LOCALES) expect(at('parents', l)).toContain(pending[l]);
  });

  it('render every FAQ item as a deep-linkable <details>, with the search as an external module', () => {
    for (const l of LOCALES) {
      const html = at('faq', l);
      const items = html.match(/<details class="faq-item"[^>]* id="[^"]+"/g) ?? [];
      expect(items.length, l).toBeGreaterThanOrEqual(21);
      expect(html, l).toMatch(/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/);
      expect(html, l).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[^<]/);
    }
  });

  it('publish the sample post in sk, cs and en with reciprocal hreflang, and no draft outline', () => {
    const slugs = {
      sk: 'ako-podporovat-samostatnost-dietata',
      cs: 'jak-podporovat-samostatnost-ditete',
      en: 'supporting-your-childs-independence',
    };
    for (const l of LOCALES) {
      const html = page(`${l}/blog/${slugs[l]}`);
      for (const o of LOCALES)
        expect(html, `${l}->${o}`).toContain(`hreflang="${o}" href="${SITE}/${o}/blog/${slugs[o]}/"`);
      expect(at('blog', l), l).toContain(`/${l}/blog/${slugs[l]}/`);
    }
    expect(readdirSync(join(out, 'sk/blog'))).not.toContain('co-je-respektujuce-vzdelavanie');
  });

  it('serve one language-neutral, noindex root 404', () => {
    const html = readFileSync(join(out, '404.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex');
    for (const l of LOCALES) expect(html).toContain(`href="/${l}/"`);
    expect(html).not.toContain('rel="canonical"');
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
