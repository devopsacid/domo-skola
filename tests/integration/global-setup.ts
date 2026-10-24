import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Fresh local D1 per run, built by the real migration path (`wrangler d1 migrations apply --local`). */
export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'domo-d1-'));
  execFileSync('node_modules/.bin/wrangler', ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', dir], {
    stdio: 'pipe',
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
  });
  process.env.D1_PERSIST_DIR = dir;
  return () => rmSync(dir, { recursive: true, force: true });
}
