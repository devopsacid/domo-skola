import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Astro emits `<style>astro-island,astro-slot,astro-static-slot{display:contents}</style>` before the
// first island, which `style-src 'self'` forbids (and build-headers rejects). The same rule ships in
// an external stylesheet instead (src/islands/admin/admin.css); this hook removes the inline copy.
const ISLAND_STYLE =
  /<style>astro-island,astro-slot,astro-static-slot\{display:contents\}<\/style>/g;
const stripIslandStyle = {
  name: 'strip-inline-island-style',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const walk = (d) =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? walk(join(d, e.name))
            : e.name.endsWith('.html')
              ? [join(d, e.name)]
              : [],
        );
      for (const f of walk(fileURLToPath(dir))) {
        const html = readFileSync(f, 'utf8');
        const out = html.replace(ISLAND_STYLE, '');
        if (out !== html) writeFileSync(f, out);
      }
    },
  },
};

// Fully static, no adapter (ADR-0001 D1). Preact serves the islands only; the sitemap arrives with a later lane.
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  integrations: [preact(), stripIslandStyle],
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  i18n: {
    defaultLocale: 'sk',
    locales: ['sk', 'cs', 'en'],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  // Static root redirect; public/_redirects adds the 301 on Cloudflare (L1).
  redirects: { '/': '/sk/' },
  // Never inline small scripts or assets: processed <script>s ship as external
  // files and nothing becomes a data: URI (strict CSP, architecture.md §11.2).
  vite: { build: { assetsInlineLimit: 0 } },
});
