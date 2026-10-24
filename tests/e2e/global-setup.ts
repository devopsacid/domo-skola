/**
 * Starts the e2e stack against the built site: a fresh local D1 (real migrations), tools/mock-mail,
 * and `wrangler pages dev dist` (static files plus the real Functions). Needs `pnpm build` first;
 * builds it when dist/ is missing. Nothing here touches real services: email goes to the mock.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockMail } from '../../tools/mock-mail/server.mjs';
import { BASE_URL, MAIL_PORT, MAIL_URL, PORT } from './env';

const WRANGLER = 'node_modules/.bin/wrangler';

export default async function globalSetup() {
  if (!existsSync('dist/_headers')) {
    execFileSync('corepack', ['pnpm@10.34.6', 'build'], {
      stdio: 'inherit',
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    });
  }

  const persist = mkdtempSync(join(tmpdir(), 'domo-e2e-d1-'));
  const env = { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' };
  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist], {
    stdio: 'pipe',
    env,
  });

  const mail = await startMockMail({ port: MAIL_PORT });

  const vars: Record<string, string> = {
    ENVIRONMENT: 'development',
    SITE_URL: BASE_URL,
    ALLOWED_ORIGINS: BASE_URL,
    EMAIL_PROVIDER: 'mock',
    EMAIL_API_BASE: MAIL_URL,
    EMAIL_API_KEY: 'dummy',
    EMAIL_FROM: 'Domoškola <noreply@skola.example>',
    EMAIL_REPLY_TO: 'info@skola.example',
    ADMIN_NOTIFY_TO: 'staff@skola.example',
    ADMIN_EMAIL_LOCALE: 'sk',
    IP_HASH_SECRET: 'e2e-test-secret-0123456789abcdef',
    RATE_LIMIT_PER_10MIN: '5',
    RATE_LIMIT_PER_DAY: '500',
    RATE_LIMIT_EMAIL_PER_DAY: '50',
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
    String(PORT),
    '--ip',
    '127.0.0.1',
    '--persist-to',
    persist,
    '--log-level',
    'log',
    ...Object.entries(vars).flatMap(([k, v]) => ['--binding', `${k}=${v}`]),
  ];
  let log = '';
  const child: ChildProcess = spawn(WRANGLER, args, { env });
  child.stdout?.on('data', (d) => (log += String(d)));
  child.stderr?.on('data', (d) => (log += String(d)));

  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE_URL}/sk/`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error(`wrangler pages dev did not start:\n${log.slice(-2000)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return async () => {
    if (process.env.DEBUG_WRANGLER) console.log(log.slice(-4000));
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    await mail.close();
    rmSync(persist, { recursive: true, force: true });
  };
}
