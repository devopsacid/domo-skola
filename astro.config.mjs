import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Fully static, no adapter (ADR-0001 D1). Preact islands for the forms (ADR-0001 D2); sitemap arrives with a later lane.
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  integrations: [preact()],
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
