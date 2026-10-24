import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import Steps from '../../src/components/ui/Steps.astro';
import FaqAccordion from '../../src/components/ui/FaqAccordion.astro';
import Timeline from '../../src/components/ui/Timeline.astro';
import Reviewable from '../../src/components/status/Reviewable.astro';
import PlaceholderMedia from '../../src/components/status/PlaceholderMedia.astro';
import LangSwitcher from '../../src/components/site/LangSwitcher.astro';
import HeroLandscape from '../../src/components/art/HeroLandscape.astro';
import { factsVerified } from '../../src/components/site/facts';
import { keepRanges } from '../../src/components/home/text';
import { LOCALES } from '../../src/shared/enums';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  delete process.env.CONTENT_STRICT;
});

describe('factsVerified (FAQ dependsOnFacts)', () => {
  const settings = {
    fees: { value: null, status: 'draft' },
    venue: {
      name: { value: { sk: 'X' }, status: 'verified' },
      address: { value: 'Y', status: 'needs-review' },
    },
    legalModel: {
      type: { value: 'community_group', status: 'verified' },
      description: { sk: 'text', cs: '', en: '' },
      partnerSchools: [],
    },
  };

  it('is false while any fact under the path is unverified', () => {
    expect(factsVerified(settings, 'settings.fees')).toBe(false);
    expect(factsVerified(settings, 'settings.venue')).toBe(false);
  });

  it('ignores non-fact leaves such as translated descriptions', () => {
    expect(factsVerified(settings, 'settings.legalModel')).toBe(true);
    expect(factsVerified(settings, 'venue.name')).toBe(true);
  });

  it('treats unknown paths and subtrees without facts as unverified', () => {
    expect(factsVerified(settings, 'settings.nope')).toBe(false);
    expect(factsVerified(settings, 'settings.legalModel.description')).toBe(false);
  });
});

describe('keepRanges', () => {
  it('joins numeric ranges so "1.–" never ends a line', () => {
    expect(keepRanges('pre 1.–4. ročník')).toBe('pre 1.–⁠4. ročník');
    expect(keepRanges('ages 6–10')).toBe('ages 6–⁠10');
    expect(keepRanges('Tatry – hory')).toBe('Tatry – hory');
  });
});

describe('shared patterns', () => {
  it('Steps renders an ordered list with decorative numerals and real headings', async () => {
    const html = await container.renderToString(Steps, {
      props: {
        steps: [
          { title: 'A', text: 'a' },
          { title: 'B', text: 'b' },
          { title: 'C', text: 'c' },
          { title: 'D', text: 'd' },
        ],
      },
    });
    expect(html).toMatch(/<ol class="steps steps--4"/);
    expect(html.match(/<li class="steps__item"/g)).toHaveLength(4);
    expect(html.match(/<h3 class="steps__title"/g)).toHaveLength(4);
    expect(html).toContain('<span class="steps__num" aria-hidden="true">');
  });

  it('FaqAccordion uses named <details> with stable ids and links only pending answers', async () => {
    const html = await container.renderToString(FaqAccordion, {
      props: {
        name: 'faq-home',
        idPrefix: 'q-',
        pendingLink: { href: '/sk/kontakt/', label: 'Napíšte nám' },
        items: [
          { id: 'one', question: 'Q1?', answer: 'P1\n\nP2', pending: true },
          { id: 'two', question: 'Q2?', answer: 'Only', pending: false },
        ],
      },
    });
    expect(html.match(/<details class="faq-item" name="faq-home"/g)).toHaveLength(2);
    expect(html).toContain('id="q-one"');
    expect(html).toContain('<p>P1</p>');
    expect(html).toContain('<p>P2</p>');
    expect(html.match(/href="\/sk\/kontakt\/"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script/);
  });

  it('Timeline shows a time only when one is given', async () => {
    const html = await container.renderToString(Timeline, {
      props: {
        items: [
          { title: 'Ráno', description: 'd', time: null, motif: 'sunrise' },
          { title: 'Obed', description: 'd', time: 'okolo 12:00' },
        ],
      },
    });
    expect(html.match(/timeline__time/g)).toHaveLength(1);
    expect(html).toContain('okolo 12:00');
    expect(html).toMatch(
      /<svg[^>]*class="motif motif--sunrise timeline__motif"[^>]*aria-hidden="true"/,
    );
  });

  it('Reviewable quiet keeps the badge but drops the outline class only by modifier', async () => {
    const html = await container.renderToString(Reviewable, {
      props: { locale: 'sk', status: 'needs-review', quiet: true },
      slots: { default: '<p>Obsah</p>' },
    });
    expect(html).toContain('review-block review-block--quiet');
    expect(html).toContain('review-badge');
  });

  it('PlaceholderMedia renders a slotted illustration instead of the mark', async () => {
    const html = await container.renderToString(PlaceholderMedia, {
      props: { locale: 'sk', field: 'gallery.venue', label: 'Priestory' },
      slots: { default: '<svg class="art"></svg>' },
    });
    expect(html).toContain('placeholder-media__frame--art');
    expect(html).toContain('<svg class="art"></svg>');
    expect(html).not.toContain('placeholder-media__mark');
  });

  it('LangSwitcher bare renders no landmark (footer), the default renders a named nav', async () => {
    const props = { locale: 'sk', hrefs: { sk: '/sk/', cs: '/cs/', en: '/en/' } } as const;
    const bare = await container.renderToString(LangSwitcher, { props: { ...props, bare: true } });
    expect(bare).not.toMatch(/<nav|aria-label/);
    const nav = await container.renderToString(LangSwitcher, { props });
    expect(nav).toMatch(/<nav aria-label="Jazyk">/);
  });
});

describe('hero landscape (brand.md §5.2, CSP)', () => {
  it('is decorative, has no pins, text, foreignObject, SMIL or style attributes', async () => {
    const html = await container.renderToString(HeroLandscape, { props: {} });
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/<text|<title|foreignObject|<animate|<set\b|style=|href=/);
    expect(Buffer.byteLength(html)).toBeLessThan(20 * 1024);
  });
});

describe('home content files', () => {
  const root = 'src/content';
  const dirs = ['pages', 'pillars', 'daySchedule', 'faqItems'];
  const files = (dir: string, locale: string) => {
    try {
      return readdirSync(join(root, dir, locale))
        .filter((f) => f.endsWith('.yaml'))
        .sort();
    } catch {
      return [];
    }
  };

  it('exist in every locale with the same file names', () => {
    for (const dir of dirs) {
      const sk = files(dir, 'sk');
      expect(sk.length, dir).toBeGreaterThan(0);
      for (const l of LOCALES) expect(files(dir, l), `${dir}/${l}`).toEqual(sk);
    }
  });

  it('are never marked verified by the build lane', () => {
    for (const dir of dirs)
      for (const l of LOCALES)
        for (const f of files(dir, l)) {
          const text = readFileSync(join(root, dir, l, f), 'utf8');
          expect(text, `${dir}/${l}/${f}`).toMatch(/^status: needs-review$/m);
          expect(text, `${dir}/${l}/${f}`).not.toMatch(/status: verified/);
        }
  });

  it('carry the Montessori and Hejný non-accreditation disclaimers in every locale', () => {
    for (const l of LOCALES)
      for (const f of ['montessori.yaml', 'hejny.yaml'])
        expect(readFileSync(join(root, 'pillars', l, f), 'utf8'), `${l}/${f}`).toMatch(
          /^disclaimer: .+/m,
        );
  });

  it('keep the day rhythm an example with no confirmed times', () => {
    for (const l of LOCALES) {
      expect(readFileSync(join(root, 'daySchedule', l, 'example.yaml'), 'utf8')).toMatch(
        /^isExample: true$/m,
      );
      expect(readFileSync(join(root, 'daySchedule', l, 'example.yaml'), 'utf8')).not.toMatch(
        /^\s+approxTime:/m,
      );
    }
  });

  it('feature at most six FAQ items on the home page per locale', () => {
    for (const l of LOCALES) {
      const featured = files('faqItems', l).filter((f) =>
        /^featuredOnHome: true$/m.test(readFileSync(join(root, 'faqItems', l, f), 'utf8')),
      );
      expect(featured.length).toBeLessThanOrEqual(6);
    }
  });
});
