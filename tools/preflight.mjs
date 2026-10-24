#!/usr/bin/env node
// Config and deploy gate. Default mode checks repo structure; --production (or ENVIRONMENT=production)
// also refuses missing RETENTION_* values, a set ACCESS_CERTS_URL, placeholders and mock mail.
// Reads process.env and wrangler.jsonc env.production.vars. Prints names, never values.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonc, preflight } from './lib/preflight.mjs';

const production = process.argv.includes('--production') || process.env.ENVIRONMENT === 'production';
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
  console.error(`preflight (${production ? 'production' : 'development'}): ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`preflight: ok (${production ? 'production' : 'development'})`);
