import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHROME, NAV_KEYS } from '../../src/components/site/strings';
import { isStrictBuild, renderMode, showPreviewMarkers } from '../../src/components/status/mode';
import { LOCALES } from '../../src/shared/enums';

function keysDeep(o: unknown, prefix = ''): string[] {
  if (typeof o !== 'object' || o === null) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => keysDeep(v, prefix ? `${prefix}.${k}` : k));
}

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

  it('never hard-codes the brand name', () => {
    const name = JSON.parse(readFileSync('src/content/settings/settings.json', 'utf8')).brandName
      .value;
    expect(JSON.stringify(CHROME)).not.toContain(name);
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
  const dirs = ['src/components', 'src/layouts', 'src/pages'];
  const files = dirs.flatMap(function walk(d: string): string[] {
    return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.astro') ? [join(d, e.name)] : [],
    );
  });

  it('has no <style> blocks, style attributes or inline handlers in templates', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/<style[\s>]/);
      expect(src, f).not.toMatch(/\sstyle=/);
      expect(src, f).not.toMatch(/\son[a-z]+=/);
      expect(src, f).not.toMatch(/is:inline/);
    }
  });

  it('loads fonts only from /fonts/ on the same origin', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    const urls = [...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\/fonts\/[a-z-]+\.woff2$/);
  });
});
