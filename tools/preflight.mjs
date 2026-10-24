#!/usr/bin/env node
// Config and deploy gate. `pnpm build` runs this first, so a production build (ENVIRONMENT=production, or a
// Cloudflare Pages build of the production branch) cannot start with missing config. L11 must keep that wiring and set
// ENVIRONMENT/PRODUCTION_BRANCH in the Pages project; do not remove it from the build script.
// Config and deploy gate. Default mode checks repo structure; --production (or ENVIRONMENT=production)
// also refuses missing RETENTION_* values, a set ACCESS_CERTS_URL, placeholders and mock mail.
// Reads process.env and wrangler.jsonc env.production.vars. Prints names, never values.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectProduction, parseJsonc, preflight } from './lib/preflight.mjs';

const detected = detectProduction({ argv: process.argv, env: process.env });
if (detected.error) {
  console.error(`preflight: ${detected.error}`);
  process.exit(1);
}
const { production } = detected;
const read = (p) => (existsSync(resolve(p)) ? readFileSync(resolve(p), 'utf8') : undefined);

let wrangler;
try {
  wrangler = parseJsonc(read('wrangler.jsonc') ?? '{}');
} catch (e) {
  console.error(`preflight: wrangler.jsonc is not valid JSONC: ${e.message}`);
  process.exit(1);
}
const routesText = read('public/_routes.json');
const { errors, warnings } = preflight({
  production,
  env: process.env,
  wrangler,
  redirects: read('public/_redirects'),
  routes: routesText ? JSON.parse(routesText) : {},
  devVarsExample: read('.dev.vars.example'),
});
for (const w of warnings) console.warn(`preflight: warning: ${w}`);
if (errors.length) {
  console.error(
    `preflight (${production ? 'production' : 'development'}): ${errors.length} problem(s)`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`preflight: ok (${production ? 'production' : 'development'})`);
