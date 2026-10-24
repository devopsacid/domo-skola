# Implementation plan: Phases 2–8

Owner: architect. Inputs: `docs/brief.md` §17, `docs/adr/0001-stack.md`, `docs/architecture.md` and `docs/ia.md`. Lanes are mapped to the owner's agents. Each lane works on its own branch, and **code-reviewer reviews every lane branch before merge** (read-only). No lane deploys. Deploys follow `cf-pages-deploy`, with one owner approval per deploy.

## 1. Standard gate (all code lanes)

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check
```

- `pnpm check` runs links, hreflang, content status, CSP and inline guard, size budgets and cms-config.
- `pnpm test:integration` is added once L5 exists, and `pnpm test:e2e` once L6 exists.
- **E2E status (ADR-0001 A4.2):** `pnpm build && pnpm test:e2e` (forms projects, then admin serially) is required locally for lanes that touch islands, pages, server, Functions or headers. Whether it becomes a required CI job is an open decision; the architect recommends yes. **Devops task first:** the CI `e2e` job switches itself on now that `playwright.config.ts` exists, but it never builds or downloads `dist/`, so it fails. It must run `pnpm build` with the `verify` env, or download the `dist` artifact, before `pnpm test:e2e`.
- **Devops task (ADR-0001 A4.3):** an `/admin/*` CSP with `! Content-Security-Policy` plus `require-trusted-types-for 'script'` in `config/headers.template`, with assertions in `tools/lib/headers.mjs` and `tools/check-dist.mjs`.
- A lane is "done" only when the gate is green on the exact commit, code-reviewer has no blocking findings, and the lane-specific gate below passes.

## 2. Lanes

> Note: L0 runs on Node 22 and pnpm 10.34.6 on the dev machine, not Node 24 and pnpm 12; see ADR-0001 D15.

| Lane | Phase | Agent | Scope | Depends on | Lane gate |
|---|---|---|---|---|---|
| **L0 Scaffold** | 2 | developer | `package.json` (Node 24, pnpm 12 via corepack, pinned deps), `astro.config.mjs`, `src/i18n/routes.ts` with the full route map, `src/content.config.ts` (all models with `status`/`Fact`), `src/shared/{enums,errors,api-types}.ts`, Vitest setup, ESLint import rules, `seed/` skeleton | — | Standard gate; unit tests for route-map completeness and enum ↔ SQL parity (stubbed) |
| **L1 Infra** | 2 | devops | `wrangler.jsonc`, `public/_redirects`, `_routes.json`, `robots.txt`, `config/headers.template`, `tools/build-headers.mjs`, `check-size`, `check-links`, `check-hreflang`, `preflight.mjs`, CI workflow (lint → test → build → check → e2e → Lighthouse CI), `.dev.vars.example` | L0 skeleton | Standard gate. CSP guard fails on a planted inline style (negative test). Preflight fails on missing `RETENTION_*` or a set `ACCESS_CERTS_URL` |
| **L2 Design system** | 2 | web-designer | `src/styles/tokens.css` from `docs/design/`, fonts, layout primitives, header and footer, language switcher, buttons, form-control CSS classes, status-marker components, a component gallery page (`/dev/components`, excluded from production) | `docs/design/` tokens, L0 | tester-ui: screenshots at every band edge (360, 430, 768, 1024, 1280, 1920) light and dark if themed, axe on the gallery, contrast measured, zero CSP violations on `preview:cf` |
| **L3 Homepage** | 3 | web-designer (sections), frontend-dev (`<details>` FAQ, mobile nav module) | Home sections A–M (`docs/ia.md` §2.1) with SK placeholder content as `needs-review` | L2 | tester-ui: responsive and focus checks, Lighthouse on `/sk/` ≥ 90/95/95, JS ≤ 10 KB |
| **L4 Content pages** | 4 | web-designer (pages), frontend-dev (`FaqSearch`, blog routing, pagination) | approach, day, parents, faq, contact (static parts), blog index and post, privacy, cookies, legal, 404 | L2, L3 patterns | Same as L3 for each page; link checker green |
| **L5a Contracts** | 5 (start in 2) | developer | `src/shared/schemas/{contact,application}.ts` (`zod/mini`, error codes), `api-types.ts` request and response contracts, `migrations/0001_init.sql` | L0 | Unit tests for every field rule and code; architect sign-off on the contract |
| **L5b Backend** | 5 | developer | Handlers, D1 repositories, limiter, honeypot, email transports (brevo, mock) and localized templates, Access JWT middleware, admin APIs, CSV, audit, retention, `/api/cms-auth/*`, `/api/e`, `tools/mock-mail`, `tools/dev-access-proxy` | L5a, L1 | Integration tests (Vitest 5 + `getPlatformProxy` D1 + `wrangler pages dev`, ADR-0001 A1): both forms, limiter, origin rejection, honeypot, email failure path, JWT invalid, missing and wrong aud, role matrix (403s), audit row on every mutation, CSV formula escaping, retention purge cascade |
| **L6 Forms UI** | 5 | frontend-dev | `ContactForm` and `EnrollmentForm` islands (stepper, review/edit, sessionStorage draft, no-JS fallback), success pages, analytics events | L2 controls, L5a; L5b for e2e | Playwright e2e in SK, CS and EN: happy path, validation errors announced, server 422 mapping, 429 and network-error recovery, no-JS submit, email captured by mock-mail in the right language, no child data in the confirmation; axe; JS ≤ 35 KB |
| **L7 Admin UI** | 5 | frontend-dev | `AdminApp` (list, filters, search, detail, status, notes, export, retention, audit), SK and EN | L5b admin APIs | e2e through the dev Access proxy as coordinator and as admin: role-gated controls absent and API 403s, CSV downloads, deletion cascades; axe; Trusted Types trial |
| **L8 CMS** | 5 | frontend-dev (config), developer (OAuth Functions) | `public/cms/config.yml` mirroring `content.config.ts` with i18n, self-hosted bundle copy, `tools/check-cms-config.mjs`, editor guide in `docs/` | L0 content models, L5b for OAuth | `check-cms-config` green; e2e: `/cms/` loads with zero CSP violations under its path policy; manual editor smoke test on a preview |
| **L9 i18n and SEO** | 6 | frontend-dev (CS and EN dictionaries, switcher edge cases), seo-expert (titles and meta, hreflang, canonical, OG, Organization JSON-LD, sitemap, robots, slug review, blog outlines for the 8 §9 topics) | All pages built | Key parity test; hreflang reciprocity and canonical checks on `dist/`; seo-expert audit; no SK strings on CS or EN pages (heuristic test); Lighthouse SEO ≥ 95 on every locale |
| **L10 QA** | 7 | tester (re-run gates, probes, mutants on schemas, auth and limiter), tester-ui (real-browser flows, every breakpoint band, focus not obscured, reduced motion, console and CSP), code-reviewer (whole-repo security and privacy pass) | L3–L9 | All gates green; zero serious or critical axe findings; zero CSP violations; mutation survivors in auth, validation or retention explained or killed |
| **L11 Production readiness** | 8 | devops (README, deployment doc, env and secret checklist, Access app and pages.dev coverage steps, D1 `--jurisdiction=eu` creation steps, WAF rule, SPF/DKIM/DMARC records, optional `workers/maintenance` cron), developer (preflight fixes), seo-expert (final audit) | L10 + owner answers (§6) | Preflight green with `CONTENT_STRICT=1`; owner-approved preview deploy verified per `cf-pages-deploy` §4 (headers per path class, Functions on, `/admin` and `/api/admin` blocked without Access on **both** the custom domain and pages.dev) |

## 3. Order and parallelism

```
Phase 2:  L0 ──┬─▶ L1 ───────────────────────────────┐
               ├─▶ L2 (needs docs/design tokens) ─┐  │
               └─▶ L5a ─▶ L5b ────────────────┐   │  │
Phase 3:                       L3 ◀───────────┼───┘  │
Phase 4:                       L4             │      │
Phase 5:          L6 (L2 + L5a; e2e on L5b) ◀─┤      │
                  L7 (L5b) ◀──────────────────┤      │
                  L8 (L0; OAuth on L5b) ◀─────┘      │
Phase 6:          L9 (after L4, L6) ◀────────────────┘
Phase 7:          L10
Phase 8:          L11
```

**Can run in parallel:**
- L1, L2 and L5a/L5b, all right after L0.
- L3 and L4 alongside L5b.
- L6, L7 and L8, once their inputs exist.

**Must be sequential:**
- L0 before everything else.
- The L5a contract freeze before L6 starts.
- L5b admin APIs before L7.
- L9 after page builds.
- L10 after all feature lanes.
- L11 last.

## 4. File-ownership boundaries (to avoid conflicts)

| Files | Owner | How others change them |
|---|---|---|
| `astro.config.mjs`, `src/content.config.ts`, `src/shared/**`, `migrations/**` | developer | Other lanes request changes in their PR description; the developer applies them |
| `wrangler.jsonc`, `config/headers.template`, `public/_*`, CI | devops | Any CSP change is an ADR-0001 amendment reviewed by the architect |
| `src/styles/**`, `src/components/**`, `src/layouts/**`, `public/fonts/**` | web-designer | frontend-dev may add island-specific classes in `src/islands/**/*.css` only |
| `src/islands/**`, `src/i18n/**`, `public/cms/**` | frontend-dev | Other lanes add i18n keys only in their own namespace file (`ui/<locale>/<namespace>.json`), which avoids merge conflicts |
| `src/content/**` | editors and content | Lanes add placeholder entries as `needs-review` or `draft` only |
| `docs/adr/**`, `docs/architecture.md`, `docs/ia.md`, `docs/plan.md` | architect | |
| `docs/design/**` | web-designer | |

## 5. Ordering risks

1. **D1 jurisdiction is permanent** (ADR-0001 F5). Create the production database with `--jurisdiction=eu` the first time, in L11 with owner approval. Never create it ad hoc.
2. **The production domain is unknown.** Canonical URLs, hreflang, `ALLOWED_ORIGINS`, the Access application and email DNS all depend on it. Use `SITE_URL` everywhere and block L11 until the domain is known.
3. **pages.dev exposure.** The Access application must also cover `<project>.pages.dev` and preview hostnames. Function JWT checks protect the data either way; L11 verifies with curl.
4. **The L5a contract must freeze before L6.** Any later change to a schema field or error code needs a coordinated PR touching both lanes.
5. **Design tokens.** L2 cannot start before `docs/design/` exists. If the design asks for Tailwind or inline styles, it needs an ADR amendment before L2 starts.
6. **Copywriting has no assigned agent.** SK placeholder copy is written in L3 and L4 as `needs-review`, CS and EN in L9. A native-speaker or owner review is required before `verified` (brief §8: no literal machine translation).
7. **Sveltia is pre-1.0.** Pin the exact version. Decap CMS is a fallback with a compatible config.

## 6. Open questions for the owner

1. **Email provider:** which account (recommended: an EU provider such as Brevo or Scaleway TEM), the sending domain and from-address, and who signs the DPA.
2. **Cloudflare Access:** which identity provider (one-time PIN by email, Google, Microsoft or GitHub), the list of admin emails, and each person's role (admin or coordinator).
3. **Git host and editors:** is the repo on GitHub, and do editors have GitHub accounts with write access? If not, the CMS backend choice changes.
4. **Publishing CMS edits:** keep a per-deploy approval for each content change, or allow Pages Git auto-deploys of `main`?
5. **Production domain**, and whether `pages.dev` should redirect to it.
6. **Legal model** of the domoškola, any partner registered school, and the wording for compulsory education. This needs legal review.
7. **Data controller identity** and contact details, legal bases, and retention periods for inquiries, applications, closed records and the audit log.
8. **Marketing consent:** is there any marketing purpose (for example a newsletter)? If not, the checkbox stays off.
9. **Analytics:** none, cookieless Plausible-compatible, or GA4 with a consent banner, plus a legal view on consent for cookieless analytics.
10. **Retention automation:** approve the optional `workers/maintenance` cron Worker (a separate Workers deploy), or keep the manual purge in admin.
11. **Phone on the enrollment form:** required as the brief lists it, or optional for data minimization?
12. **Real content:** brand name, venue, contact details, staff, fees, school year, enrollment availability, instruction languages and licensed photos (`docs/ia.md` §5).
13. **Admin list rows (L5b, `docs/architecture.md` §4.6 item 5):** may the admin list show the parent's name (never the email or the child's name) to make it usable, given that both roles can open any detail view, which is audited? Until answered, rows show no name.
14. **Marketing consent lifetime (L5b, §4.6 item 10):** before marketing is switched on, set a retention period for consents separate from the record, and decide whether proof of a withdrawal is kept (today a withdrawn consent is purged).
15. **Analytics client IP (L5b, §4.6 item 15):** if analytics is enabled, may `/api/e` forward the client IP to the provider (accurate unique visitors) or not (today: user agent only)? Legal review, together with q9.
