#!/usr/bin/env node
// The admin e2e stack, started by playwright.config.ts (webServer): a fresh local D1 (real migrations and
// the dev admin users), mock mail, the dev Access proxy and `wrangler pages dev dist`. Requires `pnpm build`.
// Nothing here is deployed or shared: loopback only, dummy secrets, throwaway state in the temp dir.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startMockMail } from '../../../tools/mock-mail/server.mjs';
import { startDevAccessProxy } from '../../../tools/dev-access-proxy/proxy.mjs';

const base = Number(process.env.E2E_ADMIN_PORT ?? 8798);
const state = join(tmpdir(), `domo-e2e-admin-${base}`);
const wrangler = resolve('node_modules/.bin/wrangler');
const site = `http://localhost:${base}`;
const team = 'dev.cloudflareaccess.com';
const aud = 'dev-aud-tag';

if (!existsSync(resolve('dist/admin/index.html'))) {
  console.error('stack: dist/admin/index.html missing. Run `pnpm build` first.');
  process.exit(1);
}
rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true });

const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const d1 = (...args) =>
  execFileSync(wrangler, ['d1', ...args, '--local', '--persist-to', state], { env, stdio: 'pipe' });
d1('migrations', 'apply', 'DB');
d1('execute', 'DB', '--file', 'tools/dev-access-proxy/seed-admins.sql');

const mail = await startMockMail({ port: base + 3 });
const proxy = await startDevAccessProxy({
  target: site,
  issuer: `https://${team}`,
  audience: aud,
  port: base + 1,
  certsPort: base + 2,
});

const bindings = {
  ENVIRONMENT: 'development',
  SITE_URL: site,
  ALLOWED_ORIGINS: site,
  ACCESS_TEAM_DOMAIN: team,
  ACCESS_AUD: aud,
  ACCESS_CERTS_URL: proxy.certsUrl,
  EMAIL_PROVIDER: 'mock',
  EMAIL_API_BASE: mail.url,
  EMAIL_FROM: 'Domoškola <noreply@skola.example>',
  EMAIL_REPLY_TO: 'info@skola.example',
  ADMIN_NOTIFY_TO: 'staff@skola.example',
  ADMIN_EMAIL_LOCALE: 'sk',
  EMAIL_API_KEY: 'dummy-email-api-key',
  IP_HASH_SECRET: 'e2e-ip-hash-secret-0123456789abcdef',
  RATE_LIMIT_PER_10MIN: '1000',
  RATE_LIMIT_PER_DAY: '1000',
  RATE_LIMIT_EMAIL_PER_DAY: '3',
  RETENTION_DAYS_INQUIRY: '30',
  RETENTION_DAYS_APPLICATION: '30',
  RETENTION_DAYS_AFTER_CLOSE: '30',
  AUDIT_RETENTION_DAYS: '30',
  MARKETING_CONSENT_ENABLED: 'false',
};
const args = [
  'pages',
  'dev',
  'dist',
  '--port',
  String(base),
  '--ip',
  '127.0.0.1',
  '--persist-to',
  state,
  ...Object.entries(bindings).flatMap(([k, v]) => ['--binding', `${k}=${v}`]),
];
const child = spawn(wrangler, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
child.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));

const stop = async () => {
  child.removeAllListeners('exit'); // the crash handler below must not fire for a requested stop
  const exited = new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
  child.kill('SIGTERM');
  const killer = setTimeout(() => child.kill('SIGKILL'), 8000);
  await Promise.all([proxy.close(), mail.close(), exited]);
  clearTimeout(killer);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => {
  console.error(`stack: wrangler exited (${code})`);
  process.exit(1);
});

for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`${site}/admin/`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`stack: ready at ${proxy.url} (wrangler ${site}, mail ${mail.url})`);
