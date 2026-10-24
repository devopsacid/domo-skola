/**
 * D1-backed fixed-window limiter (ADR-0001 D6). One upsert per window, run in a single batch with an
 * opportunistic cleanup of expired rows. Keys are `<base>:<windowIndex>` where the caller's base holds
 * only HMAC output, route and window name, so no raw IP or address is ever stored.
 */
import { stmt, type D1Like } from './db/types';

export interface LimitCheck {
  /** `ip:<hmac>:<route>:10m`, `rcpt:<hmac>:day`, ... */
  key: string;
  limit: number;
  windowMs: number;
}
export type LimitResult = { allowed: true } | { allowed: false; retryAfter: number };

export async function checkRateLimit(
  db: D1Like,
  opts: { now: number; checks: LimitCheck[] },
): Promise<LimitResult> {
  const { now, checks } = opts;
  const nowIso = new Date(now).toISOString();
  const windows = checks.map((c) => {
    const index = Math.floor(now / c.windowMs);
    const start = index * c.windowMs;
    return { ...c, fullKey: `${c.key}:${index}`, startIso: new Date(start).toISOString(), end: start + c.windowMs };
  });
  const statements = [
    stmt(db, 'DELETE FROM rate_limits WHERE expires_at < ?', nowIso),
    ...windows.map((w) =>
      stmt(
        db,
        'INSERT INTO rate_limits(key, count, window_start, expires_at) VALUES(?, 1, ?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count',
        w.fullKey,
        w.startIso,
        new Date(w.end).toISOString(),
      ),
    ),
  ];
  const results = await db.batch(statements);
  let retryAfter = 0;
  windows.forEach((w, i) => {
    const row = (results[i + 1]?.results?.[0] ?? {}) as { count?: number };
    if ((row.count ?? 0) > w.limit) retryAfter = Math.max(retryAfter, Math.ceil((w.end - now) / 1000));
  });
  return retryAfter > 0 ? { allowed: false, retryAfter } : { allowed: true };
}
