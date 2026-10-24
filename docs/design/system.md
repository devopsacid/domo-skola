# Design system

Status: **draft for owner review** (2026-10-24). Tokens: `docs/design/tokens.css`. Brand: `docs/design/brand.md`.
Stack assumption: static Astro on Cloudflare Pages with a strict CSP (architect lane). Everything here is CSS-only, same-origin and free of inline styles and scripts.

Contents: 1 Principles · 2 Grid and breakpoints · 3 Typography · 4 Colour · 5 Space, radii, elevation · 6 Components · 7 Focus and targets · 8 Verification checklist · 9 Open decisions and hand-offs

---

## 1. Principles

1. **Editorial, not template.** Hierarchy comes from type size, rhythm and whitespace; boxes, shadows and icons are the exception.
2. **Mobile first, every band.** Designed at 360–430, 768–1024 and 1280–1920, and checked at the edges between them (§2.2).
3. **Roles, not colours.** Components use role tokens; a section changes surface by swapping roles (`.surface-forest`, `.surface-night`).
4. **Honest content states.** Unknown facts have a visible, designed state (§6.11). They are never filled with plausible fiction.
5. **CSP-safe by construction.** No `style=""` attributes, no inline `<script>`, no third-party origins. Behaviour uses native HTML first: `<details>`, the Popover API, form validation. Small external JS files only where needed.
6. **No layout shift.** Fixed media dimensions, metric-matched font fallbacks, no `ch`-based measures on headings (§3.4), and animation only on `opacity` and `transform`.

---

## 2. Grid and breakpoints

### 2.1 Breakpoints (min-width, in rem so 200 % zoom drops to the smaller layout)

| Token | Value | px @16 | Range it starts | What changes |
|---|---|---|---|---|
| base | – | 0 | 320–639 (designed 360–430) | 4-col grid, stacked sections, drawer nav (brand + Menu), hero CTA full-width stack |
| `--bp-sm` | 40rem | 640 | 640–767 | language switcher visible in the header, facts inline, 2-col lists (skills, regions) |
| `--bp-md` | 48rem | 768 | tablet band 768–1023 | 8-col grid; header CTA appears; day rhythm and steps get side labels; footer 2 columns; Hero A stays stacked with a 16:9 image |
| `--bp-lg` | 64rem | 1024 | 1024–1199 | hero split (A: 7/5, B: 7/5 columns), pillar rows 3 areas, steps horizontal, footer 3 columns |
| `--bp-xl` | 75rem | 1200 | desktop 1200–1599 | 12-col grid, inline navigation (5 items + language + CTA), hero h1 at the 72 px end of the scale |
| `--bp-2xl` | 100rem | 1600 | 1600–1920+ | no new layout: the container caps at 76rem (1216 px), gutters and section padding stop growing |

Why the inline nav waits for 1200: five Slovak labels plus SK/CS/EN plus "Prihlásiť dieťa" measure about 1,100 px at `--step--1`. Czech and English are shorter, so Slovak is the binding case. Between 1024 and 1199 the Menu button stays (tested in the preview, §8).

**Edges to test every time:** 320, 359/360, 430/431, 639/640, 767/768, 1023/1024, 1199/1200, 1279/1280, 1599/1600 and 1920, plus 1280 at 200 % zoom (= 640 CSS px).

### 2.2 Grid

```
base  (4 col)   | gutter 16 |  c  c  c  c  | gutter 16 |      gap 16
md    (8 col)   | gutter ~28|  c c c c c c c c |               gap ~20
xl    (12 col)  | gutter 48 | c c c c c c c c c c c c |       gap 32, max 1216
```

- Container: `width: min(100% - 2 * var(--grid-gutter), var(--container-max))`, centred. Imagery bands may use `--container-wide` (1440) or full bleed.
- Page side gutter `--grid-gutter`: 16 → 48 px (fluid). Column gap `--grid-gap`: 16 → 32 px.
- Body text measure `--measure` 38rem (about 65 characters); hero lead and form help `--measure-narrow` 30rem.
- Layouts are written with `grid-template-columns` in `fr` per breakpoint (e.g. hero `7fr 5fr`) rather than a utility class system. Scope layout rules to their section (`.hero-a .container`) so older rules cannot leak into newer grids.
- Sections are full-width bands; `--space-section` (64 → 144 px) is their block padding. Adjacent sections with the same surface share one padding, not two.

---

## 3. Typography

### 3.1 Families

| Role | Family | Licence | Source | Why |
|---|---|---|---|---|
| Display / headings | **Fraunces** (variable: opsz, wght, SOFT, WONK) | SIL OFL 1.1, © 2018 The Fraunces Project Authors (Undercase Type), no Reserved Font Name | github.com/undercasetype/Fraunces (also google/fonts `ofl/fraunces`) | A soft, warm "Old Style" serif with editorial character. The SOFT axis rounds the terminals (organic, friendly) without becoming childish. Its optical-size axis keeps large headings elegant and small ones sturdy. |
| Body / UI | **Atkinson Hyperlegible Next** (variable: wght) | SIL OFL 1.1, © 2020–2024 The Atkinson Hyperlegible Next Project Authors (Braille Institute of America), no Reserved Font Name | github.com/googlefonts/atkinson-hyperlegible-next (also google/fonts `ofl/atkinsonhyperlegiblenext`) | Designed for legibility (distinct I/l/1, open apertures), a large x-height and a calm, humanist feel. A fit for an accessibility-first parent audience; not the generic SaaS sans. |

Rejected after side-by-side rendering in Chromium: Literata + Source Sans 3 (excellent, but reads as e-book/documentation), Newsreader + Public Sans (newspaper, cooler). All candidates were verified to contain ľ ĺ ŕ ô ä ď ť ň ř ů ě, their capitals, „ “ – … and €.

**Diacritics check (done):** both fonts render ď ť ľ Ľ with the apostrophe-form caron that Slovak and Czech typography expects (not a wedge), and ů with a proper ring. Checked visually at 24–72 px for Fraunces and 17–34 px for Atkinson.

### 3.2 Files, subsetting and budget

Instance Fraunces to the brand settings (SOFT 50, WONK 0) and the weights we use, then subset both families to Basic Latin, Latin-1, Latin Extended-A and typographic punctuation. This one file per style covers SK, CS and EN, so no `unicode-range` split and no second request on the first Slovak word.

```sh
# fonttools >= 4.40 (build-time only, not shipped)
fonttools varLib.instancer "Fraunces[SOFT,WONK,opsz,wght].ttf" SOFT=50 WONK=0 wght=400:600 opsz=18:144 -o fraunces-inst.ttf
UNI="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0218-021B,U+02C6-02C7,U+02D8-02DD,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212"
FEAT="kern,liga,calt,ccmp,locl,mark,mkmk,onum,lnum,tnum,case"
pyftsubset fraunces-inst.ttf --unicodes="$UNI" --layout-features="$FEAT" --flavor=woff2 --output-file=fraunces-roman.woff2
fonttools varLib.instancer "AtkinsonHyperlegibleNext[wght].ttf" wght=400:700 -o atk-inst.ttf
pyftsubset atk-inst.ttf --unicodes="$UNI" --layout-features="$FEAT" --flavor=woff2 --output-file=atkinson-next-roman.woff2
# italic: same with AtkinsonHyperlegibleNext-Italic[wght].ttf -> atkinson-next-italic.woff2
```

| File | Axes kept | Measured size | Loading |
|---|---|---|---|
| `fraunces-roman.woff2` | opsz 18–144, wght 400–600 | 63.5 KB | `<link rel="preload">` on every page (hero h1 = LCP) |
| `atkinson-next-roman.woff2` | wght 400–700 | 22.1 KB | preload |
| `atkinson-next-italic.woff2` | wght 400–700 | 25.1 KB | not preloaded (rare) |
| Fraunces italic | – | (75.8 KB) | **not shipped** for v1; emphasis in headings uses weight, not italic |

Preloaded fonts total about 86 KB. If the performance budget tightens, pinning `opsz=48` reduces Fraunces to 35.2 KB (measured), at some loss of finesse on the 72 px hero and of sturdiness on 23 px h3s. That would need a visual re-check.

The licence files (`OFL.txt` for each family) ship next to the fonts (`/fonts/LICENSE-fraunces.txt`, `/fonts/LICENSE-atkinson.txt`). Fonts are served from the same origin with `Cache-Control: public, max-age=31536000, immutable` and hashed filenames, and `font-src 'self'` in the CSP.

### 3.3 Scale (fluid, 360 → 1600 px)

| Token | Min → max | Use | Family / weight | Line height |
|---|---|---|---|---|
| `--step-5` | 40 → 72 | home hero h1 only | Fraunces 450, tracking −0.015em | 1.08 |
| `--step-4` | 33 → 52 | page h1, final CTA heading, step numerals | Fraunces 450 | 1.08 |
| `--step-3` | 27 → 40 | h2 section headings | Fraunces 450 | 1.18 |
| `--step-2` | 23 → 30 | h3 (pillar titles, article subheads) | Fraunces 450–560 | 1.18 |
| `--step-1` | 20 → 24 | lead paragraphs, h4, wordmark | Atkinson 400 (lead) / Fraunces 560 (h4) | 1.5 / 1.18 |
| `--step-0` | 17 → 18 | body, inputs, buttons | Atkinson 400; buttons 700 | 1.6 (UI 1.35) |
| `--step--1` | 15 → 16 | help text, captions, nav, eyebrows | Atkinson 400–700 | 1.5 |
| `--step--2` | 13 → 14 | legal fine print, image credits | Atkinson 400 | 1.5 |

- Ratio: about 1.2 on mobile, about 1.33 at desktop for headings; body barely grows (17 → 18) because Atkinson's large x-height already reads big.
- Eyebrow: `--step--1`, 700, uppercase, `--tracking-eyebrow`, `--color-accent-text`. Uppercase Slovak with diacritics (ŠTYRI PILIERE) was checked; caps carons do not clip at 1.5 line height.
- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs (progressive).
- One h1 per page. Headings follow the outline, never chosen for size: size comes from the token, so an h3 can look like `--step-3` where needed.
- Fluid sizes use rem intercepts with a small vw slope, so browser zoom scales them (WCAG 1.4.4).

### 3.4 Fallbacks and CLS

`font-display: swap` with metric-adjusted local fallbacks (`tokens.css`). Values were measured in Chromium by comparing rendered line counts of the real Slovak hero, lead, section headings and pillars with the web fonts blocked versus loaded:

| Fallback face | Source | size-adjust | ascent / descent | Result |
|---|---|---|---|---|
| Atkinson Fallback | Arial, Liberation Sans | 97.98 % | 100.43 % / 32.25 % | identical line counts at all widths 320–1920 |
| Fraunces Fallback | Times New Roman, Liberation Serif | 112 % | 87.32 % / 22.77 % | identical at 320–1199 and 1280–1920 for headings up to 52 px |
| Fraunces Display Fallback | same | 108 % | 90.56 % / 23.61 % | used only by the hero h1 (`--font-hero`) from 75rem (72 px) |

- Fraunces widens as its optical size drops (web/fallback width ratio 1.15 at 72 px, 1.23 at 40 px, 1.25 at 24 px), so one serif fallback cannot fit every size; hence the separate hero face.
- **Residual risk:** around 1200–1279 px the hero h1 sits on a line-break boundary and may re-wrap by one line on swap. Preloading the font keeps this to the first visit. The geometry test in §8 covers it.
- **Do not use `ch` for heading measures.** `ch` is the width of "0" in the current font, so `max-width: 14ch` changes when the font swaps and causes the very shift the overrides prevent (found in testing). Use `em` (`max-width: 8em` for the hero h1).
- Android has no Times/Arial. `local()` misses there and the generic serif/sans renders unadjusted until the web font arrives. Preload makes this rare; a Roboto/Noto Serif-tuned face can be added later if field CLS shows it.

---

## 4. Colour

### 4.1 Palette

| Token | Hex | Origin | Allowed as |
|---|---|---|---|
| `--palette-cream` | #F8F5ED | brief | page background, text on dark |
| `--palette-forest` | #315C4C | brief | links, secondary CTA, forest surface, illustration |
| `--palette-sage` | #A9BEA2 | brief | decorative shapes; muted text on night only |
| `--palette-terracotta` | #C77958 | brief | **decorative only** (shapes, bullets, motifs, ≥ 3:1 graphics on cream) |
| `--palette-yellow` | #E8C875 | brief | decorative on light; CTA, focus and accent on forest/night |
| `--palette-charcoal` | #29302D | brief | body text |
| `--palette-paper` | #FFFDF8 | derived | raised surfaces: forms, panels, inputs |
| `--palette-cream-2` | #EFEADD | derived | sunk band; muted text on forest |
| `--palette-sage-100` / `-200` | #E3EADF / #CBD8C5 | derived | tinted bands, image placeholders, hover fills |
| `--palette-yellow-100` | #F6EBCB | derived | "sun" band, draft marker background |
| `--palette-clay-100` | #F3DED3 | derived | "clay" band |
| `--palette-clay` | #9C5236 | derived from terracotta | **primary CTA background** |
| `--palette-clay-700` | #8E4A2F | derived | CTA hover; accent text (eyebrows, numerals) |
| `--palette-forest-700` / `-900` | #24473A / #1A3329 | derived | headings, focus ring, night surface (final CTA, footer) |
| `--palette-ink-2` / `-3` | #4F5A55 / #5E6863 | derived | muted / subtle text |
| `--palette-red` / `-100` | #A63A2B / #F6E1DC | derived | error |
| `--palette-green` / `-100` | #2F6B45 / #E1EEE4 | derived | success |
| `--palette-line` / `-strong` | #D7D1C2 / #8C8A80 | derived | decorative divider / control border |

### 4.2 Roles (summary; values in `tokens.css`)

- **Surfaces:** `--color-bg` cream · `--color-surface` paper · `--color-surface-sunk` · `-sage` · `-sun` · `-clay` · `-forest` · `-night`.
- **Text:** `--color-text` charcoal · `--color-heading` forest-900 · `--color-text-muted` ink-2 · `--color-text-subtle` ink-3 (meta only) · `--color-accent-text` clay-700 · `--color-link` forest (always underlined) · `--color-link-hover` forest-700.
- **On dark:** `--color-on-dark` cream · `--color-on-dark-muted` cream-2 · `--color-on-night-muted` sage (night only) · `--color-on-dark-accent` yellow.
- **CTA:** `--color-cta-bg` clay + `--color-cta-text` cream; hover clay-700. Secondary: forest 2 px outline + forest text; hover sage-100 fill. On dark: yellow fill + forest-900 text; secondary cream outline.
- **Focus:** `--color-focus` forest-900 on light; yellow on forest/night (remapped by the surface classes).
- **Status:** `--color-error` red on paper/cream, `--color-error-bg` for the summary box; `--color-success` likewise.
- **Borders:** `--color-border` decorative hairline (1.40:1, never the only boundary of a control) · `--color-border-strong` for inputs and controls (≥ 3:1).
- **Draft:** `--color-draft-bg` yellow-100, `--color-draft-border` clay-700 dashed, `--color-draft-text` charcoal.

### 4.3 Contrast table (WCAG 2.x relative luminance, computed)

AA = 4.5:1 for body text; AA-large / UI = 3:1 for text of at least 24 px regular or 18.66 px bold, and for UI component boundaries and focus indicators.

**Allowed text pairs**

| Foreground | Background | Ratio | Use |
|---|---|---|---|
| charcoal #29302D | cream #F8F5ED | 12.40 | body |
| charcoal | paper #FFFDF8 | 13.28 | forms |
| charcoal | sage-100 #E3EADF | 11.00 | sage band |
| charcoal | sage-200 #CBD8C5 | 9.11 | |
| charcoal | sage #A9BEA2 | 6.80 | text on a sage shape |
| charcoal | yellow-100 #F6EBCB | 11.36 | sun band, draft |
| charcoal | yellow #E8C875 | 8.33 | highlight |
| charcoal | clay-100 #F3DED3 | 10.42 | clay band |
| charcoal | cream-2 #EFEADD | 11.24 | sunk band |
| charcoal | error-100 #F6E1DC | 10.75 | error summary body |
| forest-900 #1A3329 | cream | 12.44 | headings |
| forest-900 | sage-100 | 11.04 | |
| forest-900 | yellow | 8.36 | CTA text on yellow |
| forest-700 #24473A | cream | 9.46 | link hover |
| forest-700 | sage | 5.19 | |
| forest #315C4C | cream | 6.97 | links, secondary CTA |
| forest | paper | 7.47 | |
| forest | sage-100 | 6.18 | |
| forest | sage-200 | 5.12 | |
| forest | yellow-100 | 6.39 | |
| forest | clay-100 | 5.86 | |
| forest | yellow | 4.68 | (tight; avoid small text) |
| ink-2 #4F5A55 | cream | 6.59 | muted text |
| ink-2 | sage-100 | 5.84 | |
| ink-3 #5E6863 | cream | 5.30 | subtle meta |
| ink-3 | paper | 5.68 | |
| ink-3 | yellow-100 | 4.86 | |
| ink-3 | sage-100 | 4.70 | (tight) |
| clay-700 #8E4A2F | cream | 6.08 | accent text |
| clay-700 | clay-100 | 5.11 | |
| clay-700 | sage-100 | 5.39 | |
| clay-700 | yellow-100 | 5.57 | draft label |
| clay #9C5236 | cream / paper | 5.25 / 5.62 | accent text (alt) |
| cream | clay #9C5236 | 5.25 | **primary CTA** |
| paper | clay | 5.62 | |
| cream | clay-700 | 6.08 | CTA hover |
| red #A63A2B | cream / paper | 5.91 / 6.33 | error text |
| red | error-100 | 5.13 | |
| green #2F6B45 | cream | 5.82 | success text |
| green | success-100 | 5.30 | |
| cream | forest | 6.97 | text on forest |
| paper | forest | 7.47 | |
| cream-2 | forest | 6.32 | muted on forest |
| yellow | forest | 4.68 | accent / focus on forest |
| cream | forest-700 | 9.46 | |
| cream-2 | forest-700 | 8.58 | |
| yellow | forest-700 | 6.36 | |
| sage | forest-700 | 5.19 | |
| cream | forest-900 | 12.44 | text on night |
| sage | forest-900 | 6.82 | muted on night |
| yellow | forest-900 | 8.36 | CTA / focus on night |
| cream / sage / yellow | charcoal | 12.40 / 6.80 / 8.33 | (if charcoal is ever a surface) |

**Non-text (UI and graphics, need ≥ 3:1)**

| Element | Against | Ratio |
|---|---|---|
| input border line-strong #8C8A80 | cream / paper | 3.18 / 3.41 |
| focus ring forest-900 | cream / paper / sage-100 | 12.44 / 13.28 / 11.04 |
| focus ring yellow | forest / forest-900 | 4.68 / 8.36 |
| primary CTA fill clay | cream | 5.25 |
| secondary CTA outline forest | cream | 6.97 |
| draft border clay-700 | yellow-100 | 5.57 |
| terracotta graphic | cream | 3.06 (passes 3:1 for meaningful graphics; prefer clay when it carries meaning) |

**Forbidden pairs (fail AA for text)**

| Pair | Ratio | Instead |
|---|---|---|
| terracotta #C77958 text on cream | 3.06 | clay-700 (6.08) |
| terracotta on paper | 3.28 | clay (5.62) |
| cream or white text on terracotta (button) | 3.06 / 3.33 | cream on clay (5.25) |
| charcoal on terracotta | 4.05 | avoid terracotta behind text |
| terracotta on forest-900 / charcoal | 4.07 / 4.05 | yellow |
| yellow #E8C875 text on cream | 1.49 | never; yellow is a surface or decoration on light |
| sage #A9BEA2 text on cream | 1.82 | never |
| sage text on forest | 3.82 | cream-2 (6.32) |
| forest text on sage (body size) | 3.82 | forest-700 (5.19) or charcoal (6.80) |
| line #D7D1C2 as a control border | 1.40 | line-strong |
| any text on photography without a solid scrim | – | put text beside images, not over them |

Text on photos is avoided by layout. If a caption must overlay an image, it sits on a solid `--color-surface` chip.

### 4.4 Usage proportions

Roughly 70 % cream/paper, 15 % forest (headings, one forest or night band per page, footer), 10 % sage and yellow tints as bands, 5 % clay (CTAs, eyebrows, numerals, motif accents). Only the primary CTA uses the clay fill, so it stays the single most salient action on any screen.

### 4.5 Dark theme: not in v1 (decision, with reasons)

- **The identity is paper.** Warm cream, natural photography and paper-cut illustrations carry the brand. A dark version would need its own illustration colourways and photo treatment to avoid looking like a different site.
- **The cost is real, the benefit is small.** Every page × 3 languages × forms × states would need a second visual QA pass. The audience (parents reading on phones, often in the evening) is well served by a calm light page with moderate contrast (12.4:1, not pure black on white).
- **Dark moments already exist** as designed surfaces (`.surface-night` final CTA and footer), which gives rhythm without a theme.
- **Ready if wanted later.** Components use roles only, so a dark theme is one role remap. Pre-computed candidates that pass AA: bg #1C2220, surface #252D2A, text #EEEAE0 (13.46), muted #C5C8BE (9.53), accent yellow (9.97), clay-light #E09A7C (6.99), CTA #7FB39C with #1C2220 text (6.80), error #F0907D (6.92), success #8FCB9F (8.63).
- `color-scheme: light` is set, so native controls, scrollbars and autofill stay light. **Forced colours** (Windows High Contrast) must still work: controls keep real borders, the focus ring uses `outline` (not box-shadow), and icons use `currentColor`.

---

## 5. Space, radii, elevation

### 5.1 Spacing scale

| Token | Value | Typical use |
|---|---|---|
| `--space-3xs` | 4 | icon gaps, hairline offsets |
| `--space-2xs` | 8 | label → input, inline gaps |
| `--space-xs` | 12 | between buttons, list items |
| `--space-s` | 16 | paragraph spacing, field padding |
| `--space-m` | 20 → 24 | within a block (heading → text) |
| `--space-l` | 28 → 36 | between form fields, panel padding |
| `--space-xl` | 40 → 56 | between blocks in a section, pillar row padding |
| `--space-2xl` | 56 → 88 | hero column gap, large separations |
| `--space-3xl` | 72 → 128 | rare: hero top on wide screens |
| `--space-section` | 64 → 144 | block padding of every section |

Rule of thumb: space inside a group is smaller than space between groups by at least one step. Headings sit closer to what follows them than to what precedes them (`margin-block-start` > `margin-block-end`).

### 5.2 Radii

`--radius-s` 6 (inputs, tags) · `--radius-m` 12 (panels, notes) · `--radius-l` 24 (image frames) · `--radius-pill` (buttons, chips) · `--radius-organic` (asymmetric blob for hero and portrait images) · `--radius-pebble` (soft irregular rectangle for landscape images and the mobile hero image). Organic radii are reserved for imagery and motifs, never for text containers, so text never collides with curves.

### 5.3 Elevation

Shadows are rare: `--shadow-s` (form panel), `--shadow-m` (open mobile nav, popovers), `--shadow-l` (dialogs, if any). Depth otherwise comes from surface colour changes.

---

## 6. Components

Each component lists anatomy, behaviour, states, accessibility and the responsive change. HTML names are suggestions for frontend-dev.

### 6.1 Header, language switcher, mobile nav

```
base / sm (< 48rem)
┌──────────────────────────────────────────────┐
│ [mark] Name                 [SK CS EN] [Menu] │  ← language visible from 40rem
└──────────────────────────────────────────────┘
md / lg (48–74.99rem)
│ [mark] Name             SK CS EN  [Prihlásiť dieťa] [Menu] │
xl (≥ 75rem)
│ [mark] Name  Náš prístup  Deň v komunite  Pre rodičov  Otázky  Kontakt   SK CS EN  [Prihlásiť dieťa] │
```

- **Structure:** skip link „Preskočiť na obsah“ (first focusable, visible on focus) → `<header>` → brand link (mark `alt=""` + wordmark text; the link's accessible name is the brand name) → `<nav aria-label="Hlavná navigácia">` → language `<nav aria-label="Jazyk">` → primary CTA → Menu button.
- **Sticky:** the header is sticky with a 92 % cream background and a hairline bottom border. Its real height is written to `--header-height` by a ResizeObserver in an external JS file (`style.setProperty`, CSP-safe), and `html { scroll-padding-top: calc(var(--header-height) + var(--space-s)) }` keeps anchor targets and focused fields from hiding under it (WCAG 2.4.11).
- **Mobile nav:** a `<button popovertarget="site-menu">Menu</button>` opening `<div id="site-menu" popover>` (native Popover API: Esc and light-dismiss close it, focus returns to the button, no JS). The panel is full-height on the right on mobile, `--shadow-m`, with a close button first. It contains the nav links in `--step-2` Fraunces (large, calm), then the language switcher with full names (Slovenčina, Čeština, English), then the primary CTA. `aria-expanded` is handled natively by `popovertarget`. Without Popover support the panel can fall back to a `<details>` disclosure.
- **Language switcher:** links, not a `<select>`. Each has `hreflang` and `lang`, and visible text is the code (SK · CS · EN) with an accessible name of the full language name in that language (e.g. `<a lang="cs" hreflang="cs" href="/cs/…"><span aria-hidden="true">CS</span><span class="visually-hidden">Čeština</span></a>`). The current language has `aria-current="true"` and a 2 px underline. Links point to the equivalent page (brief §2); if a page has no translation, they go to that locale's home with no silent 404. Each target is at least 44 × 44 px.
- **Nav items:** text links at `--step--1` / 550, 44 px tall, underline on hover. The current page has `aria-current="page"` and a 2 px underline.
- **Header CTA:** "Prihlásiť dieťa" `.btn-primary .btn-s` (44 px tall) from 48rem. Below that the hero carries the CTA and the drawer repeats it.

### 6.2 Hero (two options; owner chooses)

Shared content model: eyebrow (descriptor + „1.–4. ročník“), h1 (configurable headline), lead (supporting copy), primary CTA „Prihlásiť dieťa“, secondary CTA „Spoznajte náš prístup“, and a facts line („1.–4. ročník“ · „Pre rodiny z okolia Banskej Bystrice, Ružomberka a Liptovského Mikuláša“). The h1 uses `--font-hero`, `--step-5` and `max-width: 8em` (never `ch`). The primary CTA sits above the fold at 360 × 800: measured bottom edge 620 px in both options.

**Option A: Editorial split (photo-led).** Text column left, a large image in an organic frame right; strongest once authentic photography exists.

```
Mobile 360                         Desktop 1280 (≥ 64rem: 7fr | 5fr)
┌──────────────────────┐           ┌───────────────────────────────────────────────────┐
│ DOMOŠKOLA · 1.–4. R. │           │ DOMOŠKOLA · 1.–4. ROČNÍK          ╭───────────╮   │
│ Miesto, kde          │           │ Miesto, kde deti                 ╱   organic   ╲  │
│ deti objavujú        │           │ objavujú svet                   │    photo /    │ │
│ svet vlastným        │           │ vlastným tempom.                │  illustration │ │
│ tempom.              │           │ Lead (max 30rem) …               ╲             ╱  │
│ Lead …               │           │ [Prihlásiť dieťa] (Spoznajte…)    ╰───────────╯   │
│ [Prihlásiť dieťa]    │           │ • 1.–4. ročník • Pre rodiny z okolia BB, RK, LM   │
│ (Spoznajte prístup)  │           │                                   caption         │
│ • 1.–4. ročník       │           └───────────────────────────────────────────────────┘
│ • Pre rodiny z …     │           768–1023: stacked like mobile, image 16:9 pebble frame
│ ╭──────────────────╮ │
│ │ image 4:3 pebble │ │
│ ╰──────────────────╯ │
└──────────────────────┘
```

**Option B: Type-led with landscape band (illustration-led).** A large headline with the lead and CTAs beside it, then a full-bleed illustrated landscape (hills, path, Hejný motifs) across the fold. Works with no photography at all.

```
Mobile 360                         Desktop 1280 (≥ 64rem: 7fr | 5fr, top-aligned)
┌──────────────────────┐           ┌───────────────────────────────────────────────────┐
│ DOMOŠKOLA · 1.–4. R. │           │ DOMOŠKOLA · 1.–4. ROČNÍK                          │
│ Miesto, kde          │           │ Miesto, kde deti           Lead paragraph …        │
│ deti objavujú        │           │ objavujú svet              … Hejného matematiku.   │
│ svet vlastným        │           │ vlastným tempom.           [Prihlásiť dieťa] (Spoz…)│
│ tempom.              │           │ • 1.–4. ročník • Pre rodiny z okolia …            │
│ Lead …               │           │                                                   │
│ [Prihlásiť dieťa]    │           │  ～～～ sage hills ～～ △ sum-triangle ～～ ▤ blocks ～│
│ (Spoznajte prístup)  │           │ ～～～～～～ forest hill · · · · dotted path · · · ～～～│
│ • facts              │           └───────────────────────────────────────────────────┘
│ ～～ landscape band ～～ │           band: full-bleed, aspect 36:10, min-height 10rem,
└──────────────────────┘           object-position 70% bottom (sun stays in frame)
```

Recommendation: **launch with B** (no authentic photos exist yet, and the illustration doubles as the regional and nature cue without pins), then **switch to A** when real photos arrive. Both share the same content fields, so switching is a layout flag (`hero.variant`).

Hero rules: no carousel, no video background, no text over images. The hero image or illustration has explicit dimensions, `fetchpriority="high"` and no `loading="lazy"`. The landscape SVG is decorative (`alt=""`) because the facts line carries the regional information as text.

### 6.3 Section heading pattern

```
ŠTYRI PILIERE                      ← eyebrow: <p class="eyebrow">, --step--1 700 caps, accent text
Štyri prístupy, ktoré sa           ← h2: --step-3 Fraunces 450, max-width 12em, balance
navzájom dopĺňajú
Optional intro (max --measure)     ← p: --step-1 muted on landing sections, --step-0 elsewhere
[optional link →]
```

- The eyebrow is a `<p>` before the heading (or inside `<hgroup>`), never part of the heading's accessible name.
- Spacing: eyebrow → h2 `--space-2xs`; h2 → intro `--space-m`; heading block → content `--space-xl`.
- Alignment: left by default. Centred only for the final CTA band, where the content is centred too.
- An optional decorative ornament (a small Hejný motif, 40–56 px, `aria-hidden`) may sit above the eyebrow on landing sections. Use it at most once per two sections.

### 6.4 Pillar blocks (distinct, not a card grid)

The four pillars form a numbered editorial list: `<ol>` of rows separated by `--color-border-strong` hairlines, no boxes or shadows. Distinctness comes from each pillar's motif SVG and accent colour (`--color-pillar-*`), not from containers.

```
Mobile                                   Desktop (≥ 64rem: 7rem | 1fr (max 38rem) | 8rem)
────────────────────────────             ──────────────────────────────────────────────────────
01                       (motif)         01      Princípy Montessori                    (motif)
Princípy Montessori                              Pripravené prostredie, vlastné tempo …   8rem
Pripravené prostredie …                          ◦ Dieťa si volí prácu a dokončí ju
◦ benefit for parents                            ◦ Pomôcky, ktoré sa dajú chytiť do rúk
◦ benefit                                        Viac o princípoch Montessori →
Viac o princípoch Montessori →           ──────────────────────────────────────────────────────
────────────────────────────             02      Rešpektujúci prístup                   (motif)
```

- **Grid areas:** mobile `"num motif" "body body"`; desktop `"num body motif"`. Measured at 360 and 1280: the motif sits beside the numeral on mobile, and the text column stays within the measure on desktop.
- **Numeral:** `--step-4` Fraunces, `--color-accent-text`, `aria-hidden="true"` (the `<ol>` already conveys order).
- **Body:** h3 `--step-2`, a one-sentence explanation, 2–3 parent-focused benefits (`<ul>`), and a link with a specific accessible name („Viac o princípoch Montessori“, never „Viac“).
- **Motifs (decorative SVG, 72 px mobile / 128 px desktop):** Montessori: stacked blocks (pink-tower-like) in sage. Respect: two overlapping soft circles in terracotta. Constructivism: an arch of blocks in yellow. Hejný: a sum triangle or cobweb line drawing in forest.
- **Variant for the Approach page:** each pillar is a full section with a tinted band (sage-100, clay-100, yellow-100, cream-2 in pillar order) and the five sub-headings from brief §5.2 (what it means / in practice / example / benefits / what parents can expect).
- **Hover:** none on the row; only the link reacts. Rows are not clickable as a whole, which avoids nested-interactive problems.

### 6.5 Day-rhythm timeline

Illustrative only. Always shows the note „Ilustračný príklad – nie je to potvrdený rozvrh.“ (§6.11 public label) above the list. Times are shown only when configured; otherwise parts of the day are used (Ráno, Dopoludnie, Obed, Popoludnie).

```
Mobile                                  Desktop (≥ 64rem)
Ilustračný príklad – …                  ┌─────────────────────┬──────────────────────────────┐
│                                       │ h2 Deň v komunite    │ ●  Ráno                       │
●  Ráno                                 │ note (draft label)   │ │  Príchod a spoločný kruh    │
│  Príchod a spoločný kruh              │ (sticky while the    │ │  short description          │
│  short description                    │  list scrolls)       │ ●  Dopoludnie                 │
●  Dopoludnie                           │                      │ │  Samostatné objavovanie     │
│  Samostatné objavovanie               │                      │ ●  …                          │
●  …                                    └─────────────────────┴──────────────────────────────┘
```

- Semantic `<ol>`, each `<li>` holding an optional `<time>` (or a part-of-day label), an h3 (`--step-1` Fraunces), and a sentence.
- The line is a 2 px `--color-deco-sage` pseudo-element; nodes are 12 px circles in forest, with the active "now" state unused (no live clock).
- Each of the six moments (brief §5.1 D) may carry a small Hejný or nature motif. Don't use photos per step; they make the list heavy on mobile.
- Desktop: two columns (5/7); the left heading block is `position: sticky; top: calc(var(--header-height) + var(--space-l))`.
- The full page `/day-at-school` reuses the component with richer items (up to 2 short paragraphs each) and an optional illustration band between morning and afternoon.

### 6.6 Steps (enrollment process)

Always labelled „Navrhovaný postup – čaká na potvrdenie“ until confirmed (brief §5.1 J).

```
Mobile (vertical)                       Desktop ≥ 64rem (horizontal, 4 columns)
① Kontaktujete nás                      ①──────────②──────────③──────────④
│  short text                           Kontaktujete  Úvodný      Vzájomné     Dohoda o
② Úvodný rozhovor                       nás           rozhovor    spoznanie    ďalších krokoch
│  …                                    text          text        text         text
③ …                                     [Prihlásiť dieťa] after the list
④ …
```

- `<ol>` with numerals in 48 px circles (forest 2 px outline, Fraunces numeral, forest text). The connector is a decorative 2 px sage line.
- A CTA follows the list, not inside the steps.
- Text per step: 1–2 sentences, written as what happens and who does it.

### 6.7 FAQ: accordion and searchable FAQ

**Accordion (home and section FAQs)**
- Native `<details name="faq-home">` (exclusive accordion where supported) + `<summary>` containing the question as plain text. If questions need heading semantics, wrap them as `<summary><h3>…</h3></summary>`.
- Summary: min-height 44 px (target 56 px), `--step-1` Fraunces 450, padding `--space-s` 0, with a hairline divider between items. A chevron/plus icon on the right (`aria-hidden`) rotates 45° over `--duration-fast`.
- Answer: `--step-0`, max `--measure`, padding-bottom `--space-m`. Content animates open with `::details-content` and `interpolate-size` where supported; otherwise it opens instantly.
- Unknown answers use the public pending state: „Túto informáciu zatiaľ potvrdzujeme. Napíšte nám a odpovieme vám.“ + link to contact. Never invent an answer (brief §5.7).
- Hash links open the matching item (small JS: on `hashchange`, set `open`).

**Searchable, categorised FAQ (`/faq`)**

```
Mobile                                     Desktop (≥ 64rem: 4 | 8 columns)
h1 Časté otázky                            h1 Časté otázky
[🔍 Hľadať v otázkach      ]               ┌───────────────┬──────────────────────────────┐
Kategórie (scrollable chips → wrap)        │ Kategórie     │ [🔍 Hľadať v otázkach     ]  │
(Filozofia)(Právny status)(Prihláška)…     │ • Filozofia   │ 12 otázok                    │
12 otázok                                  │ • Právny…     │ h2 Vzdelávacia filozofia     │
h2 Vzdelávacia filozofia                   │ (sticky nav)  │ ▸ Aký je rozdiel …           │
▸ Aký je rozdiel medzi domoškolou …        │               │ ▸ Ako funguje Hejného …      │
▸ …                                        └───────────────┴──────────────────────────────┘
No results: „Nenašli sme otázku …“ + [Napíšte nám] + [Dohodnúť si stretnutie]
```

- **Without JS:** all questions are visible, grouped by category `<h2>`, and the category list is an in-page anchor `<nav aria-label="Kategórie otázok">`. The page is fully usable.
- **With JS (external file):** `<input type="search">` with a visible `<label>` („Hľadať v otázkach“) filters items by question and answer text, ignoring diacritics (NFD normalise, strip combining marks: „dieta“ finds „dieťa“). Matching items open and the match is wrapped in `<mark>`. Empty categories hide. A polite live region announces „Nájdené otázky: 3“, and Esc clears the field.
- **Category chips:** on mobile they wrap, with no horizontal scroll strip. Chips are links to the category anchors (not filters) to keep one mental model; each is 44 px tall.
- **No results:** a friendly message plus the contact and meeting CTAs (brief §13 funnel: FAQ → introductory meeting).

### 6.8 Form fields

```
Meno rodiča                         ← <label for>, 700, --step-0
Ako vás môžeme osloviť.             ← help: --step--1 muted, id referenced by aria-describedby (above input)
┌──────────────────────────────┐    ← input: 48 px, paper bg, 1.5 px line-strong border, radius-s
│                              │
└──────────────────────────────┘
(!) Napíšte, prosím, vaše meno.     ← error: --step--1 700, error colour, icon + text; id in aria-describedby
```

- **Order:** label → help → control → error. Help sits above the control so it is read before typing and is not covered by mobile keyboards or autofill.
- **Required and optional:** most fields are required, so mark the **optional** ones with „(nepovinné)“ in the label, and state once at the top: „Všetky polia sú povinné, ak nie je uvedené inak.“ Required fields also carry `required` / `aria-required`.
- **States:** default, hover (border charcoal), focus (focus ring, §7), invalid (`aria-invalid="true"`, 2 px error border, error message; colour is never the only signal: icon + text + thicker border), disabled (`--color-surface-sunk` bg, `--color-text-subtle` text: 4.81:1, still AA), read-only on the review step.
- **Validation:** on submit (and on "Next" in the stepper) only. A field's error clears as soon as the user types in it; it is never re-validated on each keystroke. **No blur validation** (amended at the L6 sign-off, 2026-10-24): inserting error text on blur, between `mousedown` and `mouseup`, moved the "Next" button down and the click was lost. On submit with errors, an **error summary** panel (`--color-error-bg`, red 2 px left border, `role="alert"`, heading „Skontrolujte, prosím, tieto polia:“) lists links to each field, and focus moves to it. With JS, server-side errors (422) render the same way. Without JS, the browser's native constraint validation is the field-level check, and a server failure shows one generic notice above the form (ADR-0001 A4.5).
- **Inputs:** font size ≥ 16 px (we use 17–18), correct `type`, `inputmode` and `autocomplete` (`name`, `email`, `tel`, `address-level2` for municipality). Selects use the native `<select>` with a custom chevron. Radio groups (grade 1–4, preferred next step) are a `<fieldset>` + `<legend>`, laid out as large 48 px tappable rows, not tiny dots.
- **Textarea:** min 6 rows; character guidance as help text, not a hard counter unless a limit exists.
- **Privacy acknowledgement:** a checkbox (24 px box in a 44 px row) with a link to the privacy policy opening in the same tab. Any marketing consent is a separate, unchecked, optional checkbox (brief §7).
- **Honeypot:** visually hidden with a CSS class (not `display: none` inline), `tabindex="-1"`, `autocomplete="off"` and `aria-hidden="true"`.
- **Submit states:** loading (button disabled with `aria-disabled`, label „Odosielame…“, spinner icon respecting reduced motion), success (replace the form with a confirmation panel, move focus to its heading), and failure (error summary with a retry, input preserved).
- **Layout:** single column on mobile. From 48rem short pairs (e.g. e-mail + phone) may sit side by side. The panel max width is 40rem.

### 6.9 Multi-step progress indicator (enrollment)

```
Mobile                                        Desktop ≥ 48rem
Krok 2 zo 4                                   ① Rodič ───── ② Dieťa ───── ③ Očakávania ───── ④ Kontrola
Údaje o dieťati                                 ✓ done        ● current       ○ upcoming        ○
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  (bar, 50 %)
```

- Markup: `<nav aria-label="Priebeh prihlášky"><ol>` with the four step names. The current step has `aria-current="step"`. Completed steps are buttons or links back to that step (brief §7: edit previous steps). Upcoming steps are plain text, not disabled buttons.
- The text „Krok 2 zo 4“ is always present (screen readers and mobile). The bar is decorative (`aria-hidden`): 6 px tall, forest fill on sage-100 track, radius pill.
- Icons: done = check in a forest circle; current = filled forest circle with cream numeral; upcoming = 2 px line-strong outline circle with a muted numeral. The current label is bold.
- On step change, focus moves to the step's h2 (`tabindex="-1"`), and the document title updates („Krok 2 zo 4 – Prihláška“).
- Step 4 (review) shows definition lists per step with „Upraviť“ links whose accessible names name the section („Upraviť údaje o dieťati“).

### 6.10 Buttons and CTAs

| Variant | Look | Use |
|---|---|---|
| Primary | clay fill, cream 700 text, pill, 48 px tall, `--space-m` horizontal padding | „Prihlásiť dieťa“: one per view region |
| Secondary | transparent, 2 px forest border, forest text | „Spoznajte náš prístup“, „Dohodnúť si stretnutie“ |
| Tertiary / text link | forest underlined text + optional → arrow that nudges 2 px on hover | „Viac o …“ links inside content |
| On dark (night/forest) | primary = yellow fill + forest-900 text; secondary = cream border + cream text | final CTA band, footer |
| Small | 44 px tall, `--step--1` | header CTA, chips |

- Links navigate (`<a href>`), buttons act (`<button>`). A CTA that goes to `/enrollment` is a link styled as a button.
- States: hover (clay-700 / sage-100 fill), active (translateY(1px)), focus-visible (ring), disabled (only for in-flight submits; otherwise don't disable, explain instead).
- Labels are verbs from the brief: „Prihlásiť dieťa“, „Spoznajte náš prístup“, „Dohodnúť si stretnutie“. Labels wrap rather than truncate. Test the longest EN/CS strings at 320 px.
- Pairs: primary first, then secondary, with gap `--space-xs`. On mobile they stack when they don't fit (flex-wrap); they never become full-width bars unless they are alone in a form.

### 6.11 Placeholder and draft content markers

Two different things, deliberately styled differently:

**A. Public honesty labels (ship to production).** For content that is real but provisional: illustrative day, proposed enrollment steps, fees not yet published.

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   yellow-100 bg, 2 px dashed clay-700 border, radius-m
  NAVRHOVANÝ POSTUP – ČAKÁ NA POTVRDENIE      label: --step--2 700 caps, clay-700
  Short explanation in charcoal.
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

`<aside class="note-pending" role="note">`. Text variants (SK): „Ilustračný príklad“, „Navrhovaný postup – čaká na potvrdenie“, „Informáciu zatiaľ potvrdzujeme“. The CMS has a `status: confirmed | pending` field per block that renders this label.

**B. Editorial placeholders (must never ship).** For missing facts: `[DOPLNIŤ: adresa priestorov]`.

- Inline `<mark class="placeholder" data-placeholder="venue.address">[DOPLNIŤ: …]</mark>`: yellow-100 background with a 1 px dashed clay-700 outline, so it is obvious on preview deploys.
- Image placeholder: sage-100 frame at the final aspect ratio, the mark silhouette centred, caption „[DOPLNIŤ: fotografia priestorov]“.
- **Build gate (hand-off to frontend-dev/architect):** the production build fails if any `data-placeholder` or `[DOPLNIŤ` / `[DOPLNIT` / `[TODO` string remains in the public output. Preview builds allow them.

### 6.12 Footer

Night surface (`.surface-night`), preceded by the final CTA band in the same surface (one continuous dark block at the end of every page).

```
Mobile (stacked)                          Desktop ≥ 64rem (4 columns)
[mark] Name                               [mark] Name          Stránky         Kontakt             Jazyk
descriptor                                descriptor           Náš prístup     [DOPLNIŤ: e-mail]   SK · CS · EN
Stránky ▸ links (2-col list from 40rem)   Regióny: rodiny z    Deň v komunite  [DOPLNIŤ: telefón]
Kontakt ▸ configured or omitted           okolia BB, RK, LM    Pre rodičov     Dohodnúť si
Jazyk ▸ SK · CS · EN                                           Otázky          stretnutie →
───────────                               ───────────────────────────────────────────────────────────
Ochrana osobných údajov · Cookies ·        Ochrana osobných údajov · Cookies · Právne informácie   © year Name
Právne informácie · © year Name
```

- `<footer>` with `<nav aria-label="Pätička">`. Link lists are `<ul>`, and each link has a 44 px target height (padding).
- Contact data comes only from configuration. If missing, the item is omitted in production; a placeholder appears in previews only.
- Social links render only when real URLs are configured (brief §5.1 M), as text links („Instagram“) with an optional icon, never icon-only.
- Legal row: `--step--2`, `--color-on-night-muted` (sage on night, 6.82), with links underlined.
- No newsletter box unless the owner requests one (separate consent flow).

---

## 7. Focus and touch targets

- **Focus ring:** `outline: var(--focus-width) solid var(--color-focus); outline-offset: var(--focus-offset);` on `:focus-visible` for every interactive element. Forest-900 on light surfaces (≥ 11:1) and yellow on forest/night surfaces (4.68 / 8.36), remapped automatically by the surface classes. Measured in the preview: tab order matched visual order (skip link → brand → 5 nav items → SK/CS/EN → header CTA → hero CTA …), and the night-band ring computed as yellow.
- Use outline, not box-shadow, so it survives forced-colours mode. Never `outline: none` without a replacement.
- Inputs get the same ring plus the border change. The ring sits outside the 1.5 px border.
- **Not obscured (2.4.11):** sticky header height feeds `scroll-padding-top` (§6.1). The mobile nav popover is modal-like; focus stays within it while open.
- **Targets:** every interactive target is at least `--target-min` (44 × 44 px), with buttons and inputs at 48 px (`--control-height`). Inline text links in paragraphs are exempt (WCAG 2.5.8 inline exception) but get `text-underline-offset` and line-height 1.6 for comfortable tapping. Checkboxes and radios: a 24 px visual box inside a 44 px-tall clickable label row. Measured in the preview: nav, language links and the header CTA are 44 px tall; hero CTAs are 48 px.
- Adjacent targets keep at least `--space-2xs` (8 px) between them.

---

## 8. Verification checklist (for every page build)

Done for this design system (Chromium, scratchpad preview importing the real `tokens.css`): rendering of both heroes, pillar rows, a form field with an error, the draft marker and the night CTA band at 320, 359, 360, 430, 431, 639, 640, 767, 768, 1023, 1024, 1199, 1200, 1279, 1280, 1599, 1600 and 1920. Results: no horizontal scroll at any width, the primary CTA above the fold at 360 × 800, keyboard order matching visual order, 44/48 px targets, and font-swap line counts identical except the documented 1200–1279 hero edge.

For each page:
- [ ] Widths: every edge listed in §2.1, plus 1280 at 200 % zoom; no horizontal scroll at 320 px.
- [ ] Viewport screenshots at top, middle and bottom scroll positions (sticky header).
- [ ] Geometry e2e tests (Playwright): `scrollWidth <= clientWidth`; hero CTA bottom < 800 at 360 × 800; h1 line count identical with fonts blocked versus loaded at 360, 768 and 1280; pillar text column width ≤ 38rem at 1280.
- [ ] axe: zero violations; contrast only from the allowed pairs in §4.3.
- [ ] Keyboard: skip link, tab order = visual order, popover nav (open, Esc, focus return), FAQ (Enter/Space), form error summary focus.
- [ ] Focus not obscured by the sticky header (tab through the whole page).
- [ ] Reduced motion: no transforms or transitions remain; View Transitions are off.
- [ ] SK, CS and EN: the longest strings fit at 320 px (buttons, nav, step labels).
- [ ] Console clean, no CSP violations, no third-party requests.
- [ ] Budgets: LCP < 2.5 s (hero h1 or hero image), CLS < 0.05, preloaded fonts ≈ 86 KB, hero SVG < 20 KB, page weight without photos < 250 KB.
- [ ] Production build fails on leftover editorial placeholders (§6.11 B).

---

## 9. Open decisions and hand-offs

**Owner decisions**
1. Working name: Svetlina / Lúka / Korene, or the neutral fallback "Domoškola" (brand.md §3). All need trademark, register and domain checks by the owner.
2. Hero: Option B for launch (recommended) or Option A (needs a licensed or authentic photo now).
3. Dark theme: not in v1 (recommended, §4.5). Confirm.
4. Photography: whether authentic photos with documented consent will exist, and when (this drives the hero A switch and the gallery).

**Hand-offs**
- **frontend-dev:** font build step (§3.2) and `/fonts/` with the OFL files; header-height ResizeObserver; popover nav; FAQ search script; form validation and error summary; placeholder build gate; geometry e2e tests (§8). Import `docs/design/tokens.css` as-is (adjust the `/fonts/` URLs if the app serves fonts elsewhere).
- **architect:** confirm the CSP allows `font-src 'self'`, `img-src 'self' data:` (only if SVG data URIs are used; prefer files), and no `style-src 'unsafe-inline'`. Popover/`<details>` need no script. Note that `element.style.setProperty` from an external script is allowed under a strict `style-src` (CSSOM is not blocked), but `style=""` attributes are.
- **seo-expert:** titles, meta, hreflang, OG images (use the stacked lock-up on cream, 1200 × 630), and JSON-LD `Organization` with a configurable name.
- **illustration (owner or illustrator):** final mark and wordmark once the name is chosen; the hero landscape; four pillar motifs; six day-rhythm motifs. The scratchpad sketches are geometry studies, not final art.

## 10. Implementation notes (L3 home)

- **Shared patterns for L4** (`src/components/ui/`, styles in `src/styles/patterns.css`): `Steps.astro` (§6.6), `FaqAccordion.astro` (§6.7, `<details name>`, no JS, contact link for answers whose facts are unverified), `Timeline.astro` (§6.5, time only from a verified fact).
- **Art** (`src/components/art/`, colours in `src/styles/art.css`): `HeroLandscape.astro` (option B band, no pins, ≈4 KB) and `Motif.astro` (pillar, day, example and gallery motifs). Colours come from the decorative roles `--color-deco-*`, including the new `--color-deco-sage-light`, `--color-deco-forest-deep`, `--color-deco-paper` and `--color-deco-dots`.
- **Status components:** `Reviewable quiet` places the preview badge in the section's top padding (no outline), so preview and launch layouts match; `PlaceholderMedia` takes a decorative illustration in its default slot.
- **Language switcher:** `LangSwitcher bare` renders the footer list without a second "Jazyk" landmark (axe landmark-unique).
- **Section rhythm:** `.section + .section` drops the top padding only when both bands are on the default surface.
