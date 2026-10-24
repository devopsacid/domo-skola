import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME, NAV_KEYS } from '../../src/components/site/strings';
import { isStrictBuild, renderMode, showPreviewMarkers } from '../../src/components/status/mode';
import { THEME_COLOR } from '../../src/components/site/theme';
import { LOCALES } from '../../src/shared/enums';

function keysDeep(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => keysDeep(v, prefix ? `${prefix}.${k}` : k));
}

function walk(d: string, ext: string[]): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(d, e.name), ext)
      : ext.some((x) => e.name.endsWith(x))
        ? [join(d, e.name)]
        : [],
  );
}
const templates = ['src/components', 'src/layouts', 'src/pages'].flatMap((d) =>
  walk(d, ['.astro']),
);
const sources = ['src/components', 'src/layouts', 'src/pages', 'src/styles'].flatMap((d) =>
  walk(d, ['.astro', '.ts', '.css']),
);

describe('chrome strings', () => {
  it('has identical keys and no empty strings in every locale', () => {
    const sk = keysDeep(CHROME.sk).sort();
    for (const l of LOCALES) {
      expect(keysDeep(CHROME[l]).sort()).toEqual(sk);
      for (const k of keysDeep(CHROME[l])) {
        const v = k
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], CHROME[l]);
        expect(typeof v === 'string' && v.trim().length > 0, `${l}.${k}`).toBe(true);
      }
    }
  });

  it('labels all five nav items', () => {
    for (const l of LOCALES)
      expect(Object.keys(CHROME[l].nav).sort()).toEqual([...NAV_KEYS].sort());
  });

  it('never hard-codes the brand name in strings, templates, scripts or styles', () => {
    const name = JSON.parse(readFileSync('src/content/settings/settings.json', 'utf8')).brandName
      .value as string;
    expect(sources.some((f) => f.endsWith('.astro'))).toBe(true);
    expect(JSON.stringify(CHROME)).not.toContain(name);
    for (const f of sources) expect(readFileSync(f, 'utf8'), f).not.toContain(name);
  });
});

describe('content status render mode', () => {
  it('renders verified plainly in every build', () => {
    expect(renderMode('verified', false)).toBe('plain');
    expect(renderMode('verified', true)).toBe('plain');
  });

  it('marks draft and needs-review in preview builds', () => {
    expect(renderMode('draft', false)).toBe('marked');
    expect(renderMode('needs-review', false)).toBe('marked');
    expect(showPreviewMarkers(false)).toBe(true);
  });

  it('drops draft and fails on needs-review in strict builds', () => {
    expect(renderMode('draft', true)).toBe('hidden');
    expect(() => renderMode('needs-review', true, 'pages/home.hero')).toThrow(/pages\/home\.hero/);
    expect(showPreviewMarkers(true)).toBe(false);
  });

  it('reads CONTENT_STRICT=1 only', () => {
    expect(isStrictBuild({ CONTENT_STRICT: '1' })).toBe(true);
    expect(isStrictBuild({ CONTENT_STRICT: 'true' })).toBe(false);
    expect(isStrictBuild({})).toBe(false);
  });
});

describe('styles are CSP-safe and token-based', () => {
  it('has no <style> blocks, style attributes or inline handlers in templates', () => {
    expect(templates.length).toBeGreaterThan(10);
    for (const f of templates) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/<style[\s>]/);
      expect(src, f).not.toMatch(/\sstyle=/);
      expect(src, f).not.toMatch(/\son[a-z]+=/);
      expect(src, f).not.toMatch(/is:inline/);
      expect(src, f).not.toMatch(/define:vars/);
      expect(src, f).not.toMatch(/set:html/);
    }
  });

  it('loads fonts only as bundled assets (Vite hashes them; same origin)', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    const urls = [...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    expect(urls).toEqual([
      '../assets/fonts/fraunces-roman.woff2',
      '../assets/fonts/atkinson-next-roman.woff2',
      '../assets/fonts/atkinson-next-italic.woff2',
    ]);
  });

  it('takes theme-color from the cream token', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    const cream = css.match(/--palette-cream:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(THEME_COLOR.toLowerCase()).toBe(cream?.toLowerCase());
    expect(readFileSync('src/layouts/Base.astro', 'utf8')).toContain('content={THEME_COLOR}');
  });
});
