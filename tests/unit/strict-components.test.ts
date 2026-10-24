import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import Placeholder from '../../src/components/status/Placeholder.astro';
import PlaceholderMedia from '../../src/components/status/PlaceholderMedia.astro';
import Reviewable from '../../src/components/status/Reviewable.astro';
import LangSwitcher from '../../src/components/site/LangSwitcher.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  delete process.env.CONTENT_STRICT;
});

const strict = () => {
  process.env.CONTENT_STRICT = '1';
};
const placeholderProps = { locale: 'sk', field: 'venue.address', label: 'adresa' } as const;

describe('Placeholder and PlaceholderMedia', () => {
  it('render the stable data-placeholder marker in preview builds', async () => {
    expect(await container.renderToString(Placeholder, { props: placeholderProps })).toMatch(
      /<mark class="placeholder" data-placeholder="venue.address">\[DOPLNIŤ: adresa\]<\/mark>/,
    );
    expect(await container.renderToString(PlaceholderMedia, { props: placeholderProps })).toContain(
      'data-placeholder="venue.address"',
    );
  });

  it('throw under CONTENT_STRICT=1', async () => {
    strict();
    await expect(
      container.renderToString(Placeholder, { props: placeholderProps }),
    ).rejects.toThrow(/CONTENT_STRICT=1: placeholder "venue.address"/);
    await expect(
      container.renderToString(PlaceholderMedia, { props: placeholderProps }),
    ).rejects.toThrow(/CONTENT_STRICT=1: media placeholder/);
  });
});

describe('Reviewable', () => {
  const render = (status: string) =>
    container.renderToString(Reviewable, {
      props: { locale: 'sk', status, name: 'pages/home.hero' },
      slots: { default: '<p>Obsah</p>' },
    });

  it('marks draft and needs-review in preview builds with stable markers', async () => {
    for (const s of ['draft', 'needs-review']) {
      const html = await render(s);
      expect(html).toContain('class="review-block"');
      expect(html).toContain(`data-status="${s}"`);
      expect(html).toContain('<p>Obsah</p>');
    }
  });

  it('renders verified content without markers in both modes', async () => {
    for (const mode of [false, true]) {
      if (mode) strict();
      const html = await render('verified');
      expect(html).toContain('<p>Obsah</p>');
      expect(html).not.toMatch(/review-block|data-status/);
    }
  });

  it('hides draft and throws on needs-review under CONTENT_STRICT=1', async () => {
    strict();
    const html = await render('draft');
    expect(html).not.toContain('Obsah');
    expect(html).not.toMatch(/review-block|data-status/);
    await expect(render('needs-review')).rejects.toThrow(/needs-review pages\/home\.hero/);
  });
});

describe('LangSwitcher', () => {
  it('marks the current language as the current page', async () => {
    const html = await container.renderToString(LangSwitcher, {
      props: { locale: 'cs', hrefs: { sk: '/sk/', cs: '/cs/', en: '/en/' } },
    });
    expect(html).toMatch(/<a href="\/cs\/" lang="cs" hreflang="cs" aria-current="page">/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });
});
