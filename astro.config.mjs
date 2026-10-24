import { defineConfig } from 'astro/config';

// Fully static, no adapter (ADR-0001 D1). Sitemap and Preact arrive with later lanes.
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
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
