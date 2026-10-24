/**
 * POST /api/e: first-party proxy for cookieless analytics events (ADR-0001 D12). Active only when
 * PUBLIC_ANALYTICS_PROVIDER=plausible; otherwise 404. Fixed event enum, enum-only properties, no IP
 * forwarded, upstream failures never surface to the page.
 */
import type { HandlerContext } from '../env';
import { parseAnalyticsEvent } from '../analytics';
import { MAX_BODY_BYTES, jsonResponse, publicError, readBodyCapped } from '../http';
import type { D1Like } from '../db/types';
import { hmacHex } from '../hash';
import { logError } from '../log';
import { checkRateLimit, clientIp } from '../ratelimit';
import { publicRequestAllowed } from '../security';

type RawEnv = Record<string, unknown>;
const MAX_EVENT_BYTES = 2048;

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function upstreamUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u : null;
  } catch {
    return null;
  }
}

export async function handleEvent(
  request: Request,
  env: RawEnv,
  ctx: HandlerContext,
  deps: { fetch?: typeof fetch } = {},
): Promise<Response> {
  const upstream = upstreamUrl(text(env.ANALYTICS_UPSTREAM));
  const domain = text(env.PUBLIC_ANALYTICS_DOMAIN);
  const siteUrl = text(env.SITE_URL);
  if (text(env.PUBLIC_ANALYTICS_PROVIDER) !== 'plausible' || !upstream || !domain || !siteUrl) {
    return new Response(null, { status: 404 });
  }
  if (request.method !== 'POST')
    return jsonResponse({ ok: false, error: 'bad_request' }, 405, { Allow: 'POST' });

  const allowed = (text(env.ALLOWED_ORIGINS) ?? siteUrl)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''));
  if (!publicRequestAllowed(request, { siteUrl, allowedOrigins: allowed }))
    return publicError('origin');
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return publicError('bad_request');
  }
  // Per hashed client IP, before the body is read. Generous: it only bounds abuse of the relay.
  const secret = text(env.IP_HASH_SECRET);
  const db = env.DB as D1Like | undefined;
  const environment = text(env.ENVIRONMENT) ?? 'production';
  const ip = clientIp(request, environment);
  if (!secret || !db) return publicError('server');
  if (ip === null) return publicError('bad_request');
  const perMin = Number(text(env.RATE_LIMIT_EVENTS_PER_MIN) ?? 60);
  const limited = await checkRateLimit(db, {
    now: Date.now(),
    checks: [
      {
        key: `ip:${await hmacHex(secret, 'ip', ip)}:event:1m`,
        limit: Number.isInteger(perMin) && perMin >= 0 ? perMin : 60,
        windowMs: 60_000,
      },
    ],
  });
  if (!limited.allowed) {
    return publicError(
      'rate_limited',
      { retry_after: limited.retryAfter },
      { 'Retry-After': String(limited.retryAfter) },
    );
  }
  const body = await readBodyCapped(request, Math.min(MAX_EVENT_BYTES, MAX_BODY_BYTES));
  if (body === null) return publicError('bad_request');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return publicError('bad_request');
  }
  const ev = parseAnalyticsEvent(parsed);
  if (!ev.ok) return publicError('bad_request');

  const payload = {
    name: ev.event.name,
    url: `${new URL(siteUrl).origin}${ev.event.path}`,
    domain,
    ...(ev.event.props ? { props: ev.event.props } : {}),
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const ua = request.headers.get('User-Agent');
  if (ua) headers['User-Agent'] = ua.slice(0, 300);
  ctx.waitUntil(
    (async () => {
      try {
        const res = await (deps.fetch ?? fetch)(upstream, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          redirect: 'manual', // never follow; workerd rejects 'error', and a 3xx is treated as a failure (res.ok is false)
          signal: AbortSignal.timeout(4000),
        });
        await res.body?.cancel();
      } catch (err) {
        logError(ctx.requestId, 'event', err);
      }
    })(),
  );
  return jsonResponse({ ok: true }, 202);
}
