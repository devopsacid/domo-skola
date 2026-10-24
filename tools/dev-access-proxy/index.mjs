#!/usr/bin/env node
// `node tools/dev-access-proxy/index.mjs` (or `pnpm dev:access`).
// Env (defaults match .dev.vars.example): DEV_ACCESS_TARGET=http://localhost:8788, DEV_ACCESS_PORT=8789,
// DEV_ACCESS_CERTS_PORT=8790, ACCESS_TEAM_DOMAIN=dev.cloudflareaccess.com, ACCESS_AUD=dev-aud-tag,
// DEV_ACCESS_EMAIL=admin@example.test. Pick another identity with ?dev_user=coordinator@example.test.
import { startDevAccessProxy } from './proxy.mjs';

const team = process.env.ACCESS_TEAM_DOMAIN ?? 'dev.cloudflareaccess.com';
const p = await startDevAccessProxy({
  target: process.env.DEV_ACCESS_TARGET ?? 'http://localhost:8788',
  issuer: `https://${team}`,
  audience: process.env.ACCESS_AUD ?? 'dev-aud-tag',
  port: Number(process.env.DEV_ACCESS_PORT ?? 8789),
  certsPort: Number(process.env.DEV_ACCESS_CERTS_PORT ?? 8790),
  defaultEmail: process.env.DEV_ACCESS_EMAIL ?? 'admin@example.test',
});
console.log(
  `dev-access-proxy: ${p.url} -> ${process.env.DEV_ACCESS_TARGET ?? 'http://localhost:8788'}; certs at ${p.certsUrl}`,
);
console.log(
  'Identity: ?dev_user=<email> (remembered in a cookie). The email must exist in admin_users.',
);
