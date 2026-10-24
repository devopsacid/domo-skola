import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Ports and paths of the admin e2e stack (tests/e2e/admin/stack.mjs). The base port is overridable so
 * several worktrees can run side by side. Layout: base = wrangler, +1 dev Access proxy (what the browser
 * uses), +2 mock JWKS, +3 mock mail.
 */
export const BASE = Number(process.env.E2E_ADMIN_PORT ?? 8798);
export const WRANGLER_URL = `http://localhost:${BASE}`;
export const PROXY_URL = `http://127.0.0.1:${BASE + 1}`;
export const MAIL_URL = `http://127.0.0.1:${BASE + 3}`;
/** The local D1 state of the stack; tests change retain_until here to make records due. */
export const STATE_DIR = join(tmpdir(), `domo-e2e-admin-${BASE}`);

export const COORDINATOR = 'coordinator@example.test';
export const ADMIN = 'admin@example.test';
