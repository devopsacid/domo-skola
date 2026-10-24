# domo-skola

Multilingual (SK default, CS, EN) marketing website plus enrolment backend for a Montessori-inspired domoškola (grades 1–4; Banská Bystrica, Ružomberok and Liptovský Mikuláš regions).

## Read first
- `docs/brief.md`: the owner's master brief, plus the owner decisions at the top.
- `docs/adr/0001-stack.md`, `docs/architecture.md`, `docs/ia.md` and `docs/plan.md`: the stack, the architecture, the routes and content models, and the lanes and gates.
- `docs/design/`: brand, design system and tokens.

## Rules
- **Content:** never invent organisational facts: staff, address, prices, testimonials, accreditation or legal status. Unknown facts stay in settings with `status: draft | needs-review | verified`. Only `verified` facts render as confirmed, through `verifiedValue()`. A `CONTENT_STRICT=1` build must fail on anything that isn't verified.
- **Stack:** Astro, fully static, no adapter, on Cloudflare Pages. Pages Functions serve only `/api/*`. Storage is D1 in the EU jurisdiction. Styles are plain CSS tokens.
- **CSP:** no inline styles or scripts and no external origins. `tools/build-headers.mjs` fails the build otherwise. Never loosen the CSP without an ADR amendment.
- **Toolchain:** Node 22, and `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@10.34.6 <cmd>`. The system npm is broken, and corepack 0.24 can't run pnpm 12.
- **Temp files:** use `~/.tmp/<project>-<session>/` (and `TMPDIR` pointing there for tests and builds), never `/tmp`: it is a small tmpfs shared with other sessions, and a full disk makes tests fail with EDQUOT/ENOENT. Clean up your own directory when done.
- **Gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check`, green on the exact commit; also `pnpm test:integration` (Functions, D1) and, after `pnpm build`, `pnpm test:e2e` (Playwright: `desktop`/`mobile` forms projects, then the serial `admin` project; needs the browsers installed). Each lane works on its own branch and worktree under `/home/claude/domo-skola-wt/`, gets a review from `code-reviewer`, and is then merged to `main`.
- **Islands:** no Astro `client:*` directives and no island runtime, so `dist` has no inline `<script>` or `<style>` on any page. Forms render at build time inside `<div data-island="…" data-props="…">` (a complete no-JS form) and are hydrated by an external module; the admin app renders client-only into an empty `data-island="admin"`. Both go through the one helper `mountIsland()` in `src/islands/mount.ts` (`hydrate` or `render` mode). There is no strip hook; see ADR-0001 A4.
- **Commits:** conventional messages, explicit paths, no Co-Authored-By or AI trailers.

## Deploy (Cloudflare Pages)
- Use the global `cf-pages-deploy` skill. One owner yes per deploy. Preview and production are separate approvals.
- The project is `domo-skola`. Previews go to branch `preview` at https://preview.domo-skola.pages.dev, are noindex (`PUBLIC_NOINDEX` on by default), static only, with no Functions until the backend lane ships.
- First preview, 2026-10-24: commit e11289b, deployment c636a01b. Use wrangler 4.152.0, which needed `pages project create --force` (the plain create fails in its Workers delegation). The clean-archive install needs `--prefer-offline`, because the store lacks some tarballs. New aliases take about 2 minutes to get TLS.
- Second preview, 2026-10-24: `main` 14d9a1e (homepage, forms and admin shell, static only, so the forms cannot submit yet), deployment a682d490. The static `/admin/` shell is publicly reachable on the preview until Access is approved.
- The production branch is `main`. Deploying it is a separate yes, and production preflight requires real retention values, `SITE_URL`, D1 and email settings.
- **Credentials**, read only by `secrets-manager` (entry names only): the token is the single line of `cloudflare-pages-token`, a user-scoped token verified at `/user/tokens/verify`. The account ID is the `ACCOUNT_ID:` line of `cloudflare-creds`. Never use the `API_TOKEN:` line of `cloudflare-creds`.
