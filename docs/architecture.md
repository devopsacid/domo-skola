# Architecture

Owner: architect. Decisions and their rationale are in `docs/adr/0001-stack.md` (cited as ADR-0001 Dn). The brief is `docs/brief.md`. The information architecture is `docs/ia.md`.

## 1. Overview

```
Browser ──static HTML/CSS/JS──▶ Cloudflare Pages (dist/, _headers, _redirects)
   │
   ├─ POST /api/contact, /api/applications ─▶ Pages Functions ─▶ D1 (EU jurisdiction)
   │                                              └─ waitUntil ─▶ Email provider HTTP API
   ├─ /admin/ (static shell + AdminApp) ─▶ Cloudflare Access ─▶ /api/admin/* ─▶ D1
   └─ /cms/ (Sveltia, self-hosted) ─▶ Cloudflare Access ─▶ GitHub API (content commits / PRs)
                                       └─ /api/cms-auth/* (OAuth token exchange)
```

Only `/api/*` invokes Functions (`_routes.json`). Everything else is a static file.

## 2. Modules and directories

| Path | Contents | Owner lane |
|---|---|---|
| `astro.config.mjs` | Static output, i18n, Preact, sitemap, `inlineStylesheets: 'never'` | developer |
| `wrangler.jsonc` | Pages config: `pages_build_output_dir: "dist"`, `d1_databases` (`DB`), non-secret `vars` per environment | devops |
| `config/headers.template` | Security headers and CSP per path class. Input to `tools/build-headers.mjs` | devops |
| `public/_redirects`, `public/_routes.json`, `public/robots.txt` | `/` → `/sk/` 301; Functions only on `/api/*` | devops |
| `public/cms/` | `index.html` and `config.yml` for Sveltia. The bundle is copied from `node_modules` at build | frontend-dev |
| `public/fonts/` | Self-hosted WOFF2 files | web-designer |
| `migrations/` | `NNNN_*.sql`, forward-only | developer |
| `functions/` | Thin Pages Functions route wrappers only (see §5) | developer |
| `src/pages/` | `[locale]/[...path].astro` driven by the route map; `[locale]/blog/[slug].astro`; `[locale]/404.astro`; `admin/index.astro` (noindex shell) | web-designer (layout), frontend-dev (routing) |
| `src/layouts/`, `src/components/` | Astro design-system and section components | web-designer |
| `src/islands/` | Preact: `ContactForm`, `EnrollmentForm`, `FaqSearch`, `AdminApp/`, and `ConsentBanner` (only if GA4) | frontend-dev |
| `src/islands/ui/` | Preact form controls styled with design-system classes | frontend-dev, with styling from web-designer |
| `src/styles/` | `tokens.css` (from `docs/design/`), `global.css` | web-designer |
| `src/content/` + `src/content.config.ts` | CMS-edited content collections and settings (models in `docs/ia.md` §4) | developer (schemas), editors (content) |
| `src/i18n/` | `routes.ts` (page key → slug per locale), `ui/<locale>/<namespace>.json`, `t()` helper | frontend-dev |
| `src/shared/` | Imported by both islands and server: `enums.ts`, `schemas/` (`zod/mini`), `api-types.ts` (request and response contracts), `errors.ts` (error codes) | developer |
| `src/server/` | Server-only: `handlers/`, `db/` (repositories), `email/` (transports and templates), `auth/access.ts`, `ratelimit.ts`, `csv.ts`, `audit.ts`, `retention.ts`, `log.ts` (PII-free logger), `config.ts` (env parsing with Zod) | developer |
| `seed/` | Demo content and `dev.sql` with fake records. **Never deployed**; a build guard fails if the build touches it | developer |
| `tests/{unit,integration,e2e}` | See ADR-0001 D14 | developer, frontend-dev, tester |
| `tools/` | `build-headers.mjs`, `check-links.mjs`, `check-hreflang.mjs`, `check-content.mjs`, `check-cms-config.mjs`, `check-size.mjs`, `preflight.mjs`, `mock-mail/`, `dev-access-proxy/` | devops (CI tools), developer (mock-mail, dev-access-proxy) |

**Import rules** (enforced by ESLint `no-restricted-imports`):
- `src/islands/**` and `src/components/**` must not import `src/server/**`.
- `src/shared/**` imports nothing from the app; it may use `zod/mini`.
- `functions/**` imports only `src/server/**` and `src/shared/**`.

## 3. Rendering per route

| Route | Rendering |
|---|---|
| `/sk/…`, `/cs/…`, `/en/…` (all pages, blog, legal) | Prerendered static |
| `/<locale>/404.html` | Static and localized. Pages serves the nearest `404.html` |
| `/admin/` | Static shell. Data comes only from `/api/admin/*` |
| `/cms/` | Static Sveltia app |
| `/api/*` | Pages Functions |
| `/sitemap-index.xml`, `/robots.txt` | Static, generated at build |

## 4. Data flow

### 4.1 Contact form (`/api/contact`)
1. **Browser:** the `ContactForm` island validates with `src/shared/schemas/contact.ts` on blur and on submit. It shows field errors from error codes, linked through `aria-describedby`, plus an error summary that receives focus.
2. **Submit:** a `POST` with JSON `{ locale, fields, hp, renderedAt }`.
   - The button is disabled and `aria-busy` is set during the request.
   - Network errors keep the entered data and offer a retry.
   - On success the island shows an inline success state, focuses its heading, and fires `contact_submit`.
   - **No JS:** the native `<form method="post">` sends urlencoded data. The server answers 303 to `/<locale>/<contact-sent>/`, or on failure to `/<locale>/<contact>/?error=1`, which shows a generic localized message.
3. **Function** (`src/server/handlers/contact.ts`) runs these steps in order:
   1. method, content type and size check
   2. Origin and `Sec-Fetch-Site` check (ADR-0001 D7)
   3. rate limit (D6)
   4. honeypot: return a fake 200
   5. timing and URL heuristics, which set `suspected_spam`
   6. schema parse and normalization
   7. `db.batch([INSERT contact_inquiries, INSERT email_deliveries ×2, INSERT marketing_consents?])`
   8. respond `201 {ok:true}`
4. **Email** (`ctx.waitUntil`):
   - The sender gets a localized confirmation in the page locale. It contains no user-supplied text and is skipped when the record is `suspected_spam`.
   - `ADMIN_NOTIFY_TO` gets a notification with a link to `/admin/#/inquiries/<id>`.
   - Each delivery row is updated to `sent` or `failed` with a provider error code.

Error responses use `{ok:false, error, fields?}`:

| Status | `error` |
|---|---|
| 400 | `bad_request` |
| 403 | `origin` |
| 409 | `closed` (enrollment only) |
| 422 | `validation` (with `fields: {path: code}`) |
| 429 | `rate_limited` (with `Retry-After`) |
| 500 | `server` |

Log lines carry `request_id`, route, outcome and duration only.

### 4.2 Enrollment form (`/api/applications`)
Same pipeline, with these differences:
- **Island:** a 4-step stepper with a progress indicator (`<ol>` with `aria-current="step"`). Each step validates its own sub-schema before advancing. The step-4 review links back to each step. A draft is kept in `sessionStorage` (cleared on success, never in `localStorage`). Without JS, all fieldsets render as one long form.
- **Server:** `intended_school_year` must be in `settings.schoolYear.applicationYears`, and `settings.enrollment.availability` must not be `closed`, which returns 409. Both values come from the build-time settings JSON bundled into the Function. `privacy_ack` must be `true`. `marketing_consent` is optional and accepted only when `MARKETING_CONSENT_ENABLED=true`.
- **Success:** the island navigates to `/<locale>/<enrol-submitted>/`, which shows the brief §7 text and its CS and EN equivalents. The event `enroll_submit` fires.
- **Email:** the confirmation goes out in `preferred_language` and contains no child data. The admin notification includes the grade but not the child's name.

### 4.3 Admin (`/api/admin/*`)
1. **Access edge:** a valid session is required. Otherwise the user is redirected to the IdP login.
2. **`functions/api/admin/_middleware.ts`:**
   - verifies the `Cf-Access-Jwt-Assertion` JWT (ADR-0001 D8)
   - loads `admin_users` by email; unknown or disabled gets 403
   - attaches `{email, role}`
   - enforces the CSRF rules (D7)
3. **Handlers:** check the permission matrix (§6), run parameterized queries and write `audit_log` in the same `db.batch`.
4. **Responses:** `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/me` | Current user and role |
| `GET /api/admin/records?type=inquiry\|application&status=&region=&grade=&q=&cursor=` | List, keyset-paginated. Search is `LIKE` on name and email, escaped |
| `GET /api/admin/records/:type/:id` | Detail view (audited as `view`) |
| `PATCH /api/admin/records/:type/:id/status` | Change status |
| `POST /api/admin/records/:type/:id/notes` | Add a note |
| `POST /api/admin/records/:type/:id/resend` | Resend a failed email |
| `POST /api/admin/export` | CSV export of the current filter. Formula-escaped, UTF-8 with BOM for Excel |
| `GET /api/admin/retention` | Records past `retain_until` |
| `POST /api/admin/retention/purge` | Delete those records |
| `DELETE /api/admin/records/:type/:id` | Delete one record |
| `GET /api/admin/audit?cursor=` | Audit log |

### 4.4 CMS
1. The editor opens `/cms/` and passes Access.
2. Sveltia's "Sign in with GitHub" opens `/api/cms-auth/auth`, which redirects to GitHub OAuth. The callback goes to `/api/cms-auth/callback`, which exchanges the code using `GITHUB_OAUTH_CLIENT_SECRET` and `postMessage`s the token to the opener, scoped to the site origin.
3. The editor edits in SK, CS and EN side by side. Saving opens a PR on the content branch (editorial workflow).
4. A merge to `main`, CI, and an owner-approved deploy publish the change.

## 5. Functions routing (`functions/`)

```
functions/
  _middleware.ts                 request id, security headers (F3), JSON error envelope, PII-free logging
  api/contact.ts                 onRequestPost → handlers/contact
  api/applications.ts            onRequestPost → handlers/applications
  api/e.ts                       analytics proxy (only when PUBLIC_ANALYTICS_PROVIDER=plausible; otherwise 404)
  api/cms-auth/auth.ts, callback.ts
  api/admin/_middleware.ts       Access JWT + role + CSRF
  api/admin/me.ts, records/index.ts, records/[type]/[id].ts, records/[type]/[id]/{status,notes,resend}.ts,
  api/admin/export.ts, retention/index.ts, retention/purge.ts, audit.ts
```

## 6. Admin authorization model

- **Authentication:** Cloudflare Access (owner-chosen IdP; Access policy lists the allowed emails or an IdP group). The app trusts only a verified JWT, never a cookie or a header without a signature check.
- **Authorization:** the `admin_users.role` column.

| Capability | coordinator | admin |
|---|---|---|
| List, filter, search inquiries and applications | yes | yes |
| View detail (audited) | yes | yes |
| Change status | yes | yes |
| Add notes (append-only; no edit or delete) | yes | yes |
| Resend failed email | yes | yes |
| CSV export (audited, with row count) | no | yes |
| Delete a record, or run the retention purge (audited) | no | yes |
| View audit log | no | yes |

- Managing `admin_users` is done with documented `wrangler d1 execute` SQL in v1 (ADR-0001 D8).
- Suspected-spam records are hidden by default behind a filter toggle.
- PII appears only in detail views and exports, never in list query strings or logs.

## 7. D1 data model

All timestamps are ISO-8601 UTC `TEXT`, and IDs are `crypto.randomUUID()`. Foreign keys are on. Enums are mirrored from `src/shared/enums.ts` as `CHECK` constraints.

```sql
contact_inquiries(
  id TEXT PK, created_at, updated_at, locale CHECK(sk|cs|en),
  parent_name TEXT NOT NULL (≤120), email TEXT NOT NULL (≤254), phone TEXT NULL (≤32),
  region CHECK(banska_bystrica|ruzomberok|liptovsky_mikulas|other),
  subject CHECK(general|visit|enrollment|other), message TEXT NOT NULL (≤4000),
  status CHECK(new|contacted|closed) DEFAULT 'new', status_changed_at,
  privacy_notice_version TEXT NOT NULL, privacy_ack_at TEXT NOT NULL,
  source_page TEXT,                      -- page key, not URL
  suspected_spam INTEGER DEFAULT 0,
  retain_until TEXT NOT NULL, closed_at TEXT NULL)

applications(
  id TEXT PK, created_at, updated_at, locale,
  parent_name, email, phone TEXT NOT NULL,           -- brief §7 step 1 lists phone without "optional"; owner may relax
  municipality TEXT NOT NULL (≤120), region CHECK(...as above),
  preferred_language CHECK(sk|cs|en),
  child_name TEXT NOT NULL (≤60),                    -- first or preferred name only
  intended_grade INTEGER CHECK(1..4), intended_school_year TEXT NOT NULL,
  current_arrangement CHECK(kindergarten|registered_school|individual_education|other|prefer_not_say) NULL,
  motivation TEXT (≤2000), environment_priorities TEXT (≤2000), questions TEXT NULL (≤2000),
  preferred_next_step CHECK(call|visit|info),
  status CHECK(new|contacted|meeting_planned|in_discussion|accepted|waitlisted|closed) DEFAULT 'new',
  status_changed_at, privacy_notice_version, privacy_ack_at, suspected_spam, retain_until, closed_at)

notes(
  id TEXT PK, created_at, author_email TEXT NOT NULL, body TEXT NOT NULL (≤4000),
  inquiry_id TEXT NULL REFERENCES contact_inquiries ON DELETE CASCADE,
  application_id TEXT NULL REFERENCES applications ON DELETE CASCADE,
  CHECK ((inquiry_id IS NULL) <> (application_id IS NULL)))

marketing_consents(                      -- separate legal basis; never a condition of applying
  id TEXT PK, email TEXT NOT NULL, locale, purpose TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,    -- version of the exact checkbox text shown
  granted_at TEXT NOT NULL, source CHECK(contact|application),
  inquiry_id NULL REFERENCES contact_inquiries ON DELETE SET NULL,
  application_id NULL REFERENCES applications ON DELETE SET NULL,
  withdrawn_at TEXT NULL, withdrawal_channel TEXT NULL)

email_deliveries(                        -- no recipient address, no body
  id TEXT PK, kind CHECK(sender_confirmation|admin_notification),
  inquiry_id NULL REFERENCES contact_inquiries ON DELETE CASCADE,
  application_id NULL REFERENCES applications ON DELETE CASCADE,
  status CHECK(queued|sent|failed|skipped), attempts INTEGER, provider_message_id TEXT NULL,
  last_error_code TEXT NULL, created_at, updated_at)

audit_log(                               -- append-only; the app never UPDATEs or DELETEs except the audit retention job
  id INTEGER PK AUTOINCREMENT, at TEXT NOT NULL, actor_email TEXT NOT NULL, actor_role TEXT NOT NULL,
  action CHECK(view|status_change|note_add|email_resend|export|delete|retention_purge),
  subject_type CHECK(inquiry|application|bulk), subject_id TEXT NULL,
  details TEXT NULL,                     -- JSON without PII, e.g. {"from":"new","to":"contacted"} or {"count":12}
  request_id TEXT)

admin_users(email TEXT PK, role CHECK(admin|coordinator), created_at, disabled_at NULL)

rate_limits(key TEXT PK, count INTEGER, window_start TEXT, expires_at TEXT)   -- key = HMAC(ip or email) + route + window
```

Indexes:
- `(status, created_at)` on both submission tables
- `(region)`, and `(intended_grade)` on applications
- `(retain_until)` on both submission tables
- `(at)` on audit_log
- `(expires_at)` on rate_limits

**Retention:**
- On insert, `retain_until = created_at + RETENTION_DAYS_INQUIRY` (or `RETENTION_DAYS_APPLICATION`).
- When the status becomes `closed`, `closed_at = now` and `retain_until = now + RETENTION_DAYS_AFTER_CLOSE`.
- Deleting a submission is a hard delete. Notes and deliveries cascade, and consents are unlinked.
- The audit entry keeps only the ID and action.
- `audit_log` rows older than `AUDIT_RETENTION_DAYS` are purged by the same retention action.
- Expired `rate_limits` rows are deleted opportunistically on each write.
- **No retention default is invented.** The preflight check refuses a production deploy until all `RETENTION_*` values are set, and the values are flagged for legal review.

**Privacy notice version:** `privacy_notice_version` comes from `settings.privacyNotice.version` at build time. It records which notice the user acknowledged. That acknowledgement is not consent.

## 8. Security headers (`config/headers.template` → `dist/_headers`)

**All paths:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
```

**Public pages (`/*`):**
```
default-src 'none'; script-src 'self' {{INLINE_SCRIPT_HASHES}}; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none';
manifest-src 'self'; object-src 'none'; upgrade-insecure-requests
```

**Other path classes:**
- **`/admin/*`:** the same policy, plus `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. A Trusted Types trial runs in Phase 7.
- **`/cms/*`:** `! Content-Security-Policy`, then Sveltia's policy:
  ```
  script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://avatars.githubusercontent.com;
  connect-src 'self' blob: data: https://api.github.com; media-src blob:; frame-src blob:; manifest-src blob:;
  frame-ancestors 'none'
  ```
  Exact hosts are confirmed by a CSP-violation e2e test in Phase 7. Also `X-Robots-Tag: noindex`.
- **Form pages, only if Turnstile is on:** add `https://challenges.cloudflare.com` to `script-src` and `frame-src`.
- **Caching:** `/_astro/*` and `/fonts/*` get `Cache-Control: public, max-age=31536000, immutable`.

API responses get the same base headers from `functions/_middleware.ts`, plus `Cache-Control: no-store` and `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.

## 9. Environment variables and secrets (names only)

| Name | Kind | Where | Notes |
|---|---|---|---|
| `DB` | D1 binding | wrangler.jsonc | per environment |
| `ENVIRONMENT` | var | wrangler.jsonc | `development` \| `preview` \| `production` |
| `SITE_URL` | var | wrangler.jsonc, build | canonical origin |
| `ALLOWED_ORIGINS` | var | wrangler.jsonc | comma-separated |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | var | wrangler.jsonc | |
| `ACCESS_CERTS_URL` | var | `.dev.vars` only | must be unset in production (preflight) |
| `EMAIL_PROVIDER` | var | | `brevo` \| `scaleway` \| `mock` |
| `EMAIL_API_BASE` | var | `.dev.vars` and test | override for mock-mail |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_NOTIFY_TO`, `ADMIN_EMAIL_LOCALE` | var | | |
| `EMAIL_API_KEY` | **secret** | `wrangler pages secret put` | |
| `IP_HASH_SECRET` | **secret** | | HMAC key for the limiter |
| `RATE_LIMIT_PER_10MIN`, `RATE_LIMIT_PER_DAY`, `RATE_LIMIT_EMAIL_PER_DAY` | var | | |
| `RETENTION_DAYS_INQUIRY`, `RETENTION_DAYS_APPLICATION`, `RETENTION_DAYS_AFTER_CLOSE`, `AUDIT_RETENTION_DAYS` | var | | required in production; legal review |
| `MARKETING_CONSENT_ENABLED` | var | | default `false` |
| `PUBLIC_TURNSTILE_SITE_KEY` | build var | | empty means off |
| `TURNSTILE_SECRET_KEY` | **secret** | | only if Turnstile is on |
| `PUBLIC_ANALYTICS_PROVIDER`, `PUBLIC_ANALYTICS_DOMAIN` | build var | | |
| `ANALYTICS_UPSTREAM` | var | | Plausible-compatible endpoint for `/api/e` |
| `GITHUB_OAUTH_CLIENT_ID` | var | | CMS |
| `GITHUB_OAUTH_CLIENT_SECRET` | **secret** | | CMS |
| `CONTENT_STRICT` | build var | | `1` fails the build on `needs-review` content (launch gate) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | deploy only | handled by `secrets-manager` per `cf-pages-deploy` | never in the repo or in `.dev.vars` |

`src/server/config.ts` parses `env` with Zod at the start of each request and fails closed with a 500 and an error code that contains no secret values. `.dev.vars.example` lists every name above with dummy values. `.dev.vars` is gitignored.

## 10. Local development

```bash
corepack enable && pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local          # wrangler d1 migrations apply DB --local
pnpm db:seed:local             # seed/dev.sql: fake records and two admin_users
pnpm dev                       # runs in parallel:
                               #   astro dev                (:4321, pages, HMR; Vite proxies /api → :8788)
                               #   wrangler pages dev dist  (:8788, Functions + local D1)
                               #   tools/mock-mail          (:8025, captured emails with a list UI)
                               #   tools/dev-access-proxy   (:8789 → :8788, injects a signed test Access JWT; choose the email or role via query flag)
pnpm preview:cf                # astro build + build-headers + wrangler pages dev dist (production-like; used by e2e)
pnpm test | test:integration | test:e2e | lint | typecheck | check (links, hreflang, content, csp, size, cms-config)
```

`astro dev` does not apply `_headers` or the CSP. CSP correctness is verified only on `preview:cf` and in e2e.

## 11. Constraints for design

These follow from the stack decisions (ADR-0001 D2, D10, D13). The design lane (`docs/design/`) should treat them as hard limits.

1. **No inline styles.** That means no `<style>` in components that would be inlined, no `style=""` attributes (including on SVG), no CSS-in-JS and no JS-set `element.style`. Express dynamic state with classes or `data-*` attributes styled in CSS files. The build fails otherwise.
2. **No inline scripts or `on*=` attributes.** A theme pre-paint script, if dark mode needs one, must be an external file. Prefer `prefers-color-scheme` alone.
3. **Fonts are self-hosted** WOFF2 files in `public/fonts/`. No Google Fonts or other CDN.
   - Subsets must include Latin Extended-A for Slovak and Czech (ä ô ľ ĺ ŕ č ď ň š ť ž ý á í é ú ě ř ů).
   - Use at most 2 families and preload at most 2 files.
   - The licence must allow self-hosted web use.
   - Use `font-display: swap` or `optional`, and size-adjusted fallbacks to avoid CLS.
4. **No third-party embeds** (maps, video, social widgets). A map is a static image plus an outbound link. Video needs a click-to-load design and an ADR amendment.
5. **Images go through `astro:assets`** (AVIF or WebP, explicit dimensions). Every image needs alt text in 3 languages. Illustrative imagery carries a visible "illustrative" label (brief §4). Never show AI-generated children presented as pupils.
6. **Motion is CSS-only**, using `transform` and `opacity`, and must be fully disabled under `prefers-reduced-motion`. No page-transition router.
7. **JS budget** (ADR-0001 D2): content pages ≤ 10 KB gzip. Interactive patterns on content pages should be no-JS where possible: `<details>` for FAQ and accordions, CSS-only or tiny-module mobile nav, and plain links for the language switcher.
8. **Form controls exist twice,** in Astro for static use and in Preact for islands. Specify them as **CSS classes and markup structure**, not framework components: input, select, radio-card, checkbox, error text, error summary, stepper, button states (loading, disabled).
9. **Contrast** of the brief palette on cream `#F8F5ED`:

   | Colour | Ratio | Use for text? |
   |---|---|---|
   | forest `#315C4C` | 6.97:1 | yes |
   | charcoal `#29302D` | 12.4:1 | yes |
   | terracotta `#C77958` | 3.06:1 | large text and UI borders only, not body text |
   | sage `#A9BEA2` | 1.82:1 | no; surfaces only |
   | muted yellow `#E8C875` | 1.49:1 | no; surfaces only |

   Charcoal on terracotta is 4.05:1, which fails for normal-size text.
10. **Status markers are needed as components:** "illustrative example", "pending confirmation" and "proposed process" (brief §5.1 D and J, §5.3, §5.4). The same applies to the preview-only review badge for `needs-review` content.
11. **Touch targets** are at least 24×24 CSS px (WCAG 2.2 AA 2.5.8). 44×44 px is the house target for primary controls. Focus indicators must be visible on every background token.
12. **Breakpoint bands** from brief §4: 360–430, 768–1024 and 1280–1920 px. Layouts are mobile-first.
