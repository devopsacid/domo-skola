# Information architecture (brief Phase 1)

Owner: architect. Sources: `docs/brief.md` §5, §8, §9, §13 and §14; stack decisions in `docs/adr/0001-stack.md`. All copy referenced here is placeholder until the owner verifies it.

## 1. Sitemap and localized slugs

### Decision: translate slugs per language
Examples: `/sk/nas-pristup/`, `/cs/nas-pristup/`, `/en/approach/`.

- **SEO:** the slug carries local search terms ("prístup", "pre rodičov", "prihláška") that match the §9 Slovak and Czech queries. It also reads naturally in SERPs and in shared links.
- **Hreflang and switching:** both are driven by one route map, `src/i18n/routes.ts` (page key → slug per locale), so translated slugs cost nothing at switch time.
  - The switcher links straight to the same page key in the target locale (brief §2 "preserve the current page").
  - On blog posts it uses the post's `translationKey`. If no translation exists, it goes to that locale's blog index, and no hreflang alternate is emitted for the missing language.
- **Stable keys:** page keys, not slugs, are the identifiers in code, analytics and content. A later slug change is then one route-map edit plus a `_redirects` 301.
- **Trailing slash** on every URL (ADR-0001 D1). `/` redirects 301 to `/sk/`. `x-default` points to the SK URL.
- **Avoided terms:** "zápis" (the same word in SK and CS) is deliberately **not** used, because they imply official school enrollment. The form is an expression of interest (brief §5.5).
- **Region pages:** none. There are no `/banska-bystrica/` style city pages; that is the doorway-page risk named in brief §9. Regional relevance comes from home §I, from "For parents" (geographic accessibility), and from blog articles.

### Route map

| Page key | SK | CS | EN |
|---|---|---|---|
| `home` | `/sk/` | `/cs/` | `/en/` |
| `approach` | `/sk/nas-pristup/` | `/cs/nas-pristup/` | `/en/approach/` |
| `day` | `/sk/nas-den/` | `/cs/nas-den/` | `/en/our-day/` |
| `parents` | `/sk/pre-rodicov/` | `/cs/pro-rodice/` | `/en/for-parents/` |
| `enrol` | `/sk/prihlaska/` | `/cs/prihlaska/` | `/en/apply/` |
| `enrol-submitted` | `/sk/prihlaska/odoslana/` | `/cs/prihlaska/odeslana/` | `/en/apply/submitted/` |
| `contact` | `/sk/kontakt/` | `/cs/kontakt/` | `/en/contact/` |
| `contact-sent` | `/sk/kontakt/odoslane/` | `/cs/kontakt/odeslano/` | `/en/contact/sent/` |
| `faq` | `/sk/caste-otazky/` | `/cs/caste-dotazy/` | `/en/faq/` |
| `blog` | `/sk/blog/` | `/cs/blog/` | `/en/blog/` |
| `post` | `/sk/blog/<slug>/` | `/cs/blog/<slug>/` | `/en/blog/<slug>/` |
| `privacy` | `/sk/ochrana-osobnych-udajov/` | `/cs/ochrana-osobnich-udaju/` | `/en/privacy/` |
| `cookies` | `/sk/cookies/` | `/cs/cookies/` | `/en/cookies/` |
| `legal` | `/sk/pravne-informacie/` | `/cs/pravni-informace/` | `/en/legal/` |
| `404` | `/sk/404.html` | `/cs/404.html` | `/en/404.html` |

Notes on the route map:
- **`day`:** the brief calls this "A Day at School" (§5.3). The neutral slug avoids calling the community a "škola" before the legal model is confirmed (§5.4). The page title may still say "Deň v našej komunite".
- **Submitted and sent pages** (`enrol-submitted`, `contact-sent`) are `noindex` and excluded from the sitemap. They exist so the no-JS fallback works and so conversions are counted.
- **Not in the sitemap:** `/admin/` and `/cms/` (`noindex`, also disallowed in robots.txt).
- **Pillar anchors:** "Learn more" links from home §C go to `approach#<pillar-anchor>`. Anchors are localized per pillar in content (e.g. `#hejneho-matematika` / `#hejneho-metoda` / `#hejny-mathematics`).
- **Slug review:** all slugs are `needs-review` by the seo-expert and the owner (a native-speaker check for CS) before launch.

## 2. Page section outlines

Every page has:
- localized `<title>` and description
- canonical and hreflang (sk, cs, en, x-default)
- Open Graph tags and breadcrumbs (except home)
- the global header (logo, nav, primary CTA "Prihlásiť dieťa", language switcher) and footer (§5.1 M)

### 2.1 `home` (brief §5.1)

| § | Section | Content source | Notes |
|---|---|---|---|
| A | Hero | `pages/home.hero` | Headline (brief §3, needs-review); supporting copy; CTA → `enrol`; secondary CTA → `approach`; facts line "1.–4. ročník · regióny BB, RK, LM" from `settings` |
| B | Our philosophy | `pages/home.philosophy` | |
| C | Four pillars | `pillars` (4) | Summary, parent benefits, link to `approach#anchor` |
| D | A day in our community | `daySchedule` | Visible label "Ilustračný príklad"; CTA → `day` |
| E | What children develop | `pages/home.outcomes` (8 items) | No outcome promises (brief §3) |
| F | How learning works | `pages/home.examples` | Measurement and Hejný examples from brief §5.1 F |
| G | Educational environment | `gallery` (kind venue, materials, outdoor) | Placeholders labelled "illustrative" until real photos exist |
| H | Who it suits | `pages/home.fit` | Non-discriminatory wording, needs-review |
| I | Regions | `settings.regions` + `pages/home.regions` | Reach, not locations; venue shown only if `settings.venue.status = verified` |
| J | How enrollment works | `pages/home.process` (4 steps) | Label "Navrhovaný postup" until verified |
| K | FAQ | `faqItems` where `featuredOnHome` (≤ 6) | `<details>`; link → `faq` |
| L | Final CTA | `pages/home.finalCta` | CTA → `enrol`; secondary → `contact` (visit) |
| M | Footer | `settings` | Social links only when URL status is verified |

### 2.2 `approach` (brief §5.2)
1. Intro.
2. One section per pillar (Montessori-inspired, respectful education, constructivism, Hejný mathematics), each with the 5 sub-blocks from §5.2: what it means, in practice, examples, benefits, what parents can expect. Each pillar carries the accreditation disclaimer for Montessori and Hejný (brief §2).
3. Learning through projects.
4. Emotional development.
5. Individual pace.
6. How progress is observed and evaluated.
7. How the approaches complement each other.
8. CTA to `enrol` and `contact`.

### 2.3 `day` (brief §5.3)
1. Intro with the "illustrative example" marker.
2. A timeline from `daySchedule` covering: rhythm, independent and guided learning, outdoors, creative work, rest, social interaction, maths and language, and reflection.
3. A block of "details pending confirmation" (meals, times) driven by `settings` facts.
4. CTA.

### 2.4 `parents` (brief §5.4)
1. Grades and ages.
2. Geographic accessibility (regions, venue fact, commuting notes).
3. Learning structure.
4. Communication with parents.
5. Educational goals.
6. Progress monitoring.
7. Cooperation with the registered school.
8. Attendance expectations.
9. Food and outdoors.
10. Indicative admission process.
11. **Fees:** rendered only if `settings.fees.status = verified`; otherwise "Informácie o poplatkoch doplníme".
12. Visiting.
13. **Legal and organizational status:** a visible, editable block from `settings.legalModel`. It explains the difference between a registered school, a community learning group and individual education, lists partner schools (verified only) and parent responsibilities. If unverified, it shows a neutral "Právny model upresníme" text and never asserts a status.

### 2.5 `enrol` (brief §5.5, §7)
1. Offer overview.
2. Grades.
3. Eligibility and next steps.
4. Admission process (the "proposed" marker until verified).
5. `EnrollmentForm` (4 steps).
6. "How we process your data" summary with a link to `privacy`.
7. The explicit sentence "Prihláška je prejavom záujmu, nie potvrdením prijatia."

`settings.enrollment.availability` controls the page:
- `open`: the form
- `waitlist`: the form plus a waitlist notice
- `closed`: the form is replaced by a contact CTA

### 2.6 `contact` (brief §5.6, §6)
1. `ContactForm`. The subject can be preselected through `?subject=visit` from CTAs; a `<select>` default set by the island and validated server-side.
2. Public contact details (verified only).
3. Venue (verified only), with a static map image and an outbound link.
4. Regional coverage.
5. A "Request a visit or introductory meeting" explainer.

### 2.7 `faq` (brief §5.7)
- Category chips (8 categories from §5.7).
- `FaqSearch` island: a client-side filter over prerendered items. Without JS, all items are visible and grouped.
- Each item is a `<details>` with a stable id for deep links.
- The 11 required questions are seeded with `needs-review` answers. For any answer that depends on unknown facts, the answer template states that the information will be confirmed and links to `contact`.
- `FAQPage` JSON-LD is emitted only for `verified` items.

### 2.8 `blog` and `post` (brief §9)
- **Index:** filter by topic cluster, paginated statically.
- **Post:** title, dates (published and updated), author (a team member or "Redakcia"), body, related posts, and a CTA.
- **Legal review:** posts flagged `legalReviewRequired` are not published until `legalReviewedAt` is set (brief §9: legal explanations must be verified). This applies to the "individuálne vzdelávanie" and "domoškola vs. tradičná škola" articles.
- The 8 article concepts from §9 are seeded as `draft` outlines.

### 2.9 `privacy`, `cookies`, `legal`
- **Body text:** from `pages/*`, all `needs-review` and rendered with a visible "draft, pending legal review" banner until verified.
- **Facts:** controller identity, processors (Cloudflare, the email provider, analytics if any), retention and legal bases come from `settings` facts.
- **Cookies page:** states the actual cookies. The default is none on public pages; the Access cookie applies to admins only.

## 3. User journeys and conversion funnels (brief §13)

Main conversion: **`enroll_submit`**. Secondary conversions: `contact_submit`, `visit_request` (contact submit with subject `visit`), `cta_click{cta: enrol}`, and `info_request` (enrollment with `preferred_next_step = info`).

| Funnel | Path | Steps measured |
|---|---|---|
| F1 Learn → apply | `home` → `approach` → `enrol` → `enrol-submitted` | `page_view(home)` → `page_view(approach)` → `cta_click{cta:enrol, location}` → `enroll_start` (first field focus) → `enroll_step{step:2,3,4}` → `enroll_submit` |
| F2 Practical → contact | `home` → `parents` → `contact` → `contact-sent` | `page_view` ×3 → `contact_submit{subject}` |
| F3 Doubts → meeting | `home` → `faq` → `contact?subject=visit` | `page_view(faq)` → `faq_search` (no query text sent) → `cta_click{cta:visit}` → `visit_request` |

Event rules:
- **Fixed enum.** Properties are enums only: `cta` ∈ {enrol, approach, visit, contact}; `location` ∈ {header, hero, pillar, process, final, footer, inline}; `step` ∈ {1..4}; `subject` ∈ the subject enum.
- No PII, no free text and no IDs are sent. `locale` is added automatically.
- Events fire only if `PUBLIC_ANALYTICS_PROVIDER ≠ none` (ADR-0001 D12).

Key journeys:
- **J1, first-time parent on mobile from search** (e.g. "Hejného matematika Banská Bystrica"): blog post → pillar section → enrollment. In-article CTAs and the related-pillar link carry this journey.
- **J2, cautious parent checking legitimacy:** legal status block on `parents` → FAQ "How is compulsory education fulfilled?" → contact. Every unknown is shown as pending, never as fact.
- **J3, Czech family:** `/cs/` via hreflang → same funnels. The confirmation email is in CS.
- **J4, English-speaking family:** `/en/`. The site must not imply English instruction; `settings.instructionLanguages` decides what is stated (brief §8).
- **J5, staff:** Access login → `/admin/` → filter `status=new` → detail → status `contacted` + note → later CSV export (admin role) → retention purge.
- **J6, editor:** `/cms/` → edit an FAQ answer in SK, then CS and EN → set `status: verified` → save (PR) → publish after an approved deploy.

## 4. Content models (CMS, `src/content.config.ts` ↔ `public/cms/config.yml`)

### Common rules
- Every collection entry and every fact carries `status: draft | needs-review | verified` plus an optional `reviewNote`, which is internal and never rendered.
- **Rendering rules:**
  - `draft` is excluded from production builds.
  - `needs-review` is rendered, with a visible review badge in preview builds. In production, `CONTENT_STRICT=1` (the launch gate) fails the build if any `needs-review` item is rendered.
  - `verified` is rendered normally.
- **Facts** (settings values that assert something about the organisation) use the type `Fact<T> = { value: T | null, status }`. A fact that is not `verified` renders the localized "pending confirmation" text, or the containing block is hidden. Its value is never shown as confirmed.
- **i18n:** `i18n: true` marks translatable fields and `i18n: duplicate` marks shared ones. Collections use the `multiple_folders` structure `src/content/<collection>/<locale>/<id>.md`. Settings use `single_file`.
- **Seed and demo content** lives in `seed/` and is never deployed (brief §14).

### Collections

| Model | Fields (translatable fields marked *) | Notes |
|---|---|---|
| `settings` (single file) | `brandName: Fact<string>`; `contact: {email: Fact, phone: Fact}`; `venue: {name*, address, municipality, mapImage, mapUrl, commuteNotes*}` as Fact; `regions[]: {key, label*}`; `schoolYear: {current: Fact, applicationYears: Fact<string[]>}`; `enrollment: {availability: Fact<open\|waitlist\|closed>, note*}`; `fees: {visible: bool, text*}` as Fact; `legalModel: {type: Fact<unknown\|registered_school\|community_group\|individual_education_support\|other>, description*, partnerSchools[]: {name, url, status}, parentResponsibilities*}`; `dataController: {name, address, companyId, email, dpoContact}` as Facts; `privacyNotice: {version, effectiveDate, status}`; `marketingConsent: {enabled, purpose*, text*, textVersion}`; `instructionLanguages: Fact<string[]>`; `social[]: {network, url, status}`; `seoDefaults: {siteName*, ogImage}` | One file, all locales. `privacyNotice.version` is bundled into Functions |
| `pages` (file per page key) | `seo: {title*, description*, ogImage}`; `sections` (typed per page, e.g. `hero: {headline*, lead*, ctaPrimary*, ctaSecondary*, image}`), each with `status` | Keys: home, approach, day, parents, enrol, contact, faq, blog, privacy, cookies, legal |
| `pillars` | `key` (montessori\|respectful\|constructivist\|hejny), `order`, `title*`, `anchor*`, `summary*`, `parentBenefits*[]`, `whatItMeans*`, `inPractice*`, `examples*[]`, `benefits*`, `parentsCanExpect*`, `disclaimer*`, `illustration`, `status` | Exactly 4 |
| `daySchedule` (single file) | `isExample: true` (fixed), `disclaimer*`, `items[]: {kind (arrival\|independent\|guided\|project\|math_language\|outdoor\|creative\|rest\|social\|reflection), approxTime?: Fact<string>, title*, description*}`, `status` | Times are optional facts; with no time set, the order alone is shown |
| `faqCategories` | `key` (philosophy\|legal\|enrollment\|daily\|parents\|costs\|location\|language_support), `title*`, `order`, `status` | |
| `faqItems` | `id`, `category` (relation), `question*`, `answer*` (Markdown), `order`, `featuredOnHome`, `dependsOnFacts[]` (settings paths), `status` | `dependsOnFacts` lets the build flag answers whose facts are unverified |
| `team` | `name`, `role*`, `bio*`, `photo`, `photoRightsConfirmed: bool`, `qualifications*` (only verifiable claims), `order`, `status` | Section hidden until at least one member is `verified` |
| `gallery` | `image`, `alt*`, `caption*`, `kind` (venue\|materials\|outdoor\|creative\|illustrative), `isIllustrative: bool`, `source`, `licence`, `rightsConfirmed: bool`, `status` | `isIllustrative` renders a visible label; people imagery requires `rightsConfirmed` |
| `posts` | `translationKey`, `title*`, `slug*`, `excerpt*`, `body*`, `cluster` (respectful\|montessori\|hejny\|constructivism\|choosing\|legal\|independence), `publishedAt`, `updatedAt`, `author` (team relation or "editorial"), `cover: {image, alt*}`, `seo: {title*, description*}`, `legalReviewRequired`, `legalReviewedAt`, `status` | Publishing needs `verified` and, where required, `legalReviewedAt` |
| `ui` (JSON per locale and namespace) | Dictionaries for `common`, `nav`, `forms`, `validation`, `email`, `admin`, `seo` and `status` (application status labels) | Edited as translations. Key parity is enforced by a unit test |

There is deliberately **no testimonials model** (brief §3, §13, §15). One is added only when real, consented testimonials exist.

## 5. Unknown facts that must stay configurable

Never write these as confirmed copy. Each lives as a `Fact` in `settings`, a config variable, or `needs-review` content.

| Unknown | Where it lives |
|---|---|
| Brand name (working-name placeholder) | `settings.brandName` |
| Legal operating model; partner or registered school(s); how compulsory education is fulfilled; parent responsibilities | `settings.legalModel`, FAQ legal items |
| Any accreditation or certification (Montessori, Hejný) — none assumed | Pillar disclaimers |
| Data controller identity, address and company ID; DPO contact | `settings.dataController` |
| Legal bases, retention periods, processor list | Privacy page, `RETENTION_*` vars |
| Venue address, map, commute information | `settings.venue` |
| Public email and phone | `settings.contact` |
| Social media URLs | `settings.social` |
| School year(s) accepting applications; enrollment availability | `settings.schoolYear`, `settings.enrollment` |
| Fees and tuition | `settings.fees` |
| Instruction languages | `settings.instructionLanguages` |
| Daily times, meals, outdoor time, attendance expectations | `daySchedule`, `parents` sections |
| Admission process (proposed until confirmed) | `pages/home.process`, `pages/enrol` |
| Staff names, roles, qualifications, photos | `team` |
| Real photos and their rights | `gallery` |
| Production domain (canonical, hreflang, Access, email DNS) | `SITE_URL` |
| Admin notification recipients | `ADMIN_NOTIFY_TO` |
| Whether a marketing purpose exists at all | `settings.marketingConsent.enabled`, `MARKETING_CONSENT_ENABLED` |
