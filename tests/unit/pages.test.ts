/**
 * L4 content pages: pure helpers (blog publishing rules, post locale, FAQ matching) and
 * guards on the draft copy (brief §3, §5.4: no invented facts, everything needs review).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byDate, isRenderable, related, translationMap, type PostLike } from '../../src/components/blog/rules';
import { localeOf } from '../../src/components/blog/posts';
import { fold, matches, ranges, terms } from '../../src/components/faq/match';
import { LOCALES } from '../../src/shared/enums';

const post = (o: Partial<PostLike>): PostLike => ({
  translationKey: 'k',
  slug: 's',
  status: 'needs-review',
  legalReviewRequired: false,
  cluster: 'independence',
  ...o,
});

describe('blog publishing rules', () => {
  it('never renders drafts, and needs-review only outside strict builds', () => {
    expect(isRenderable(post({ status: 'draft' }), false)).toBe(false);
    expect(isRenderable(post({ status: 'needs-review' }), false)).toBe(true);
    expect(isRenderable(post({ status: 'needs-review' }), true)).toBe(false);
    expect(isRenderable(post({ status: 'verified' }), true)).toBe(true);
  });

  it('holds back a legal post until legalReviewedAt is set, even when verified', () => {
    const legal = post({ status: 'verified', legalReviewRequired: true });
    expect(isRenderable(legal, false)).toBe(false);
    expect(isRenderable({ ...legal, legalReviewedAt: new Date('2026-10-01') }, true)).toBe(true);
  });

  it('sorts newest first, undated last, then by slug', () => {
    const list = [
      post({ slug: 'b' }),
      post({ slug: 'old', publishedAt: new Date('2025-01-01') }),
      post({ slug: 'a' }),
      post({ slug: 'new', publishedAt: new Date('2026-01-01') }),
    ].sort(byDate);
    expect(list.map((p) => p.slug)).toEqual(['new', 'old', 'a', 'b']);
  });

  it('maps translations by key and picks related posts from the same cluster first', () => {
    const map = translationMap([
      { locale: 'sk', post: post({ slug: 'sk-a' }) },
      { locale: 'en', post: post({ slug: 'en-a' }) },
    ]);
    expect(map.get('k')).toEqual({ sk: 'sk-a', en: 'en-a' });
    const me = post({ slug: 'me', cluster: 'hejny' });
    const all = [me, post({ slug: 'x', cluster: 'legal' }), post({ slug: 'y', cluster: 'hejny' })];
    expect(related(me, all).map((p) => p.slug)).toEqual(['y', 'x']);
  });

  it('reads the locale from the file path, not from the (slug) entry id', () => {
    expect(localeOf('src/content/posts/cs/jak-podporovat.md')).toBe('cs');
    expect(localeOf('/abs/repo/src/content/posts/en/x.md')).toBe('en');
    expect(localeOf('src/content/pages/sk/x.yaml')).toBeUndefined();
    expect(localeOf(undefined)).toBeUndefined();
  });
});

describe('FAQ search matching', () => {
  it('ignores case and diacritics', () => {
    expect(fold('Dieťa ŠKOLA')).toBe('dieta skola');
    expect(matches('Ako sa plní povinná školská dochádzka?', terms('dochadzka skolska'))).toBe(true);
    expect(matches('Koľko stojí účasť?', terms('vonku'))).toBe(false);
    expect(matches('anything', terms('   '))).toBe(true);
  });

  it('maps matches back to ranges in the original text', () => {
    const text = 'Čas vonku a čas spolu';
    expect(ranges(text, terms('cas'))).toEqual([
      [0, 3],
      [12, 15],
    ]);
  });
});

const root = 'src/content';
const read = (dir: string, l: string) =>
  readdirSync(join(root, dir, l)).map((f) => ({
    f: `${dir}/${l}/${f}`,
    text: readFileSync(join(root, dir, l, f), 'utf8'),
  }));
const L4_PAGES = ['approach', 'day', 'parents', 'faq', 'blog', 'privacy', 'cookies', 'legal'];

describe('L4 draft copy', () => {
  const entries = LOCALES.flatMap((l) => [
    ...read('pages', l).filter((e) => L4_PAGES.some((k) => e.f.endsWith(`/${k}.yaml`))),
    ...read('faqItems', l),
    ...read('faqCategories', l),
    ...read('posts', l),
  ]);

  it('exists for every L4 page in every locale', () => {
    for (const l of LOCALES)
      for (const k of L4_PAGES) expect(entries.some((e) => e.f === `pages/${l}/${k}.yaml`), `${l}/${k}`).toBe(true);
  });

  it('is never verified yet, and every reviewable entry carries a reviewNote', () => {
    for (const { f, text } of entries) {
      expect(text, f).not.toMatch(/^status: verified$/m);
      expect(text, f).toMatch(/^reviewNote: \S/m);
    }
  });

  it('keeps the same FAQ items in every locale', () => {
    const ids = (l: string) => read('faqItems', l).map((e) => e.f.split('/').pop()).sort();
    expect(ids('cs')).toEqual(ids('sk'));
    expect(ids('en')).toEqual(ids('sk'));
  });

  it('states no prices, currencies or numeric group sizes', () => {
    const money = /€|\bEUR\b|\beur\b|Kč|\bCZK\b/;
    const groupSize = /\b\d+\s*(detí|dětí|children|žiakov|žáků|pupils)\b/i;
    for (const { f, text } of entries) {
      expect(text, f).not.toMatch(money);
      expect(text, f).not.toMatch(groupSize);
    }
  });

  it('uses the one adult term (sprievodca / průvodce / guide), never "teacher", in the sample post too', () => {
    for (const l of LOCALES)
      for (const { f, text } of read('posts', l)) expect(text, f).not.toMatch(/učiteľ|učitel|teacher/i);
  });

  it('flags every formal or legal block for legal review', () => {
    for (const l of LOCALES) {
      const parents = readFileSync(join(root, 'pages', l, 'parents.yaml'), 'utf8');
      const formal = parents.split(/^ {2}formal:$/m)[1]?.split(/^ {2}legal:$/m)[0] ?? '';
      expect(formal, `${l} formal`).toMatch(/reviewNote: "LEGAL REVIEW REQUIRED/);
      expect(formal, `${l} formal`).toMatch(/dependsOnFacts: \[settings\.legalModel\]/);
      for (const k of ['privacy', 'cookies', 'legal'])
        expect(readFileSync(join(root, 'pages', l, `${k}.yaml`), 'utf8'), `${l}/${k}`).toMatch(/LEGAL REVIEW/);
    }
  });
});
