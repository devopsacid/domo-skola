/**
 * The shared pipeline behind POST /api/contact and POST /api/applications
 * (docs/architecture.md sections 4.1 and 4.2, ADR-0001 D6 and D7). Order:
 *   method and content type -> size -> origin -> rate limit -> body -> honeypot -> (closed) ->
 *   validation -> (school year) -> marketing consent -> recipient limit -> heuristics ->
 *   one db.batch() -> response -> emails in waitUntil.
 */
import { LOCALES, type Locale } from '../../shared/enums';
import type { ErrorCode } from '../../shared/errors';
import { validateApplication } from '../../shared/schemas/application';
import {
  MAX_URLS,
  MIN_FILL_MS,
  countUrls,
  isHoneypotHit,
  isTooFast,
} from '../../shared/schemas/common';
import { validateContact } from '../../shared/schemas/contact';
import { localePath, type PageKey } from '../../i18n/routes';
import { parseConfig, type Config } from '../config';
import {
  insertApplication,
  insertConsent,
  insertDelivery,
  insertInquiry,
  type SubmissionMeta,
} from '../db/submissions';
import { resolveDeps, type Deps } from '../deps';
import { buildTransport, composeEmails, sendAndRecord, type EmailSubject } from '../email/dispatch';
import type { Env, HandlerContext } from '../env';
import { decodeUrlencoded } from '../forms/urlencoded';
import { hmacHex } from '../hash';
import { MAX_BODY_BYTES, jsonResponse, publicError, readBodyCapped } from '../http';
import { logError, logRequest } from '../log';
import { checkRateLimit, clientIp } from '../ratelimit';
import { publicRequestAllowed } from '../security';

type Kind = 'contact' | 'application';

const KINDS: Record<Kind, { route: string; formPage: PageKey; sentPage: PageKey }> = {
  contact: { route: 'contact', formPage: 'contact', sentPage: 'contact-sent' },
  application: { route: 'applications', formPage: 'enrol', sentPage: 'enrol-submitted' },
};

const DAY_MS = 86_400_000;
const TEN_MIN_MS = 600_000;

const isLocale = (v: unknown): v is Locale =>
  typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function handleSubmission(
  kind: Kind,
  request: Request,
  env: Env,
  ctx: HandlerContext,
  overrides: Partial<Deps> = {},
): Promise<Response> {
  const started = Date.now();
  const route = KINDS[kind].route;
  const finish = (res: Response, outcome: string) => {
    logRequest({
      request_id: ctx.requestId,
      route,
      outcome,
      status: res.status,
      duration_ms: Date.now() - started,
    });
    return res;
  };
  try {
    return await run(kind, request, env, ctx, resolveDeps(overrides), finish);
  } catch (err) {
    logError(ctx.requestId, route, err);
    return finish(publicError('server'), 'error');
  }
}

async function run(
  kind: Kind,
  request: Request,
  env: Env,
  ctx: HandlerContext,
  deps: Deps,
  finish: (res: Response, outcome: string) => Response,
): Promise<Response> {
  const meta = KINDS[kind];

  // 1. method, content type, size
  if (request.method !== 'POST') {
    return finish(
      jsonResponse({ ok: false, error: 'bad_request' }, 405, { Allow: 'POST' }),
      'method',
    );
  }
  const ct = (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  const mode: 'json' | 'form' | null =
    ct === 'application/json' ? 'json' : ct === 'application/x-www-form-urlencoded' ? 'form' : null;
  if (!mode) return finish(publicError('bad_request'), 'content_type');

  let cfg: Config;
  try {
    cfg = parseConfig(env);
  } catch (err) {
    logError(ctx.requestId, meta.route, err);
    return finish(publicError('server'), 'config');
  }

  // Responses depend on the mode: the no-JS form is answered with a 303 to a localized page.
  let pageLocale: Locale = 'sk';
  const failure = (
    error: ErrorCode,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) =>
    mode === 'form' && error !== 'origin'
      ? redirect(`${localePath(meta.formPage, pageLocale)}?error=1`)
      : publicError(error, extra, headers);
  const success = () =>
    mode === 'form'
      ? redirect(localePath(meta.sentPage, pageLocale))
      : jsonResponse({ ok: true }, 201);

  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    return finish(failure('bad_request'), 'too_large');

  // 2. origin and fetch metadata
  if (!publicRequestAllowed(request, cfg)) return finish(failure('origin'), 'origin');

  // 3. rate limit per hashed IP (before any parsing)
  const nowMs = deps.now().getTime();
  const ip = clientIp(request, cfg.environment);
  if (ip === null) return finish(failure('bad_request'), 'no_client_ip');
  const ipHash = await hmacHex(cfg.ipHashSecret, 'ip', ip);
  const limited = await checkRateLimit(env.DB, {
    now: nowMs,
    checks: [
      {
        key: `ip:${ipHash}:${meta.route}:10m`,
        limit: cfg.rateLimit.per10min,
        windowMs: TEN_MIN_MS,
      },
      { key: `ip:${ipHash}:${meta.route}:day`, limit: cfg.rateLimit.perDay, windowMs: DAY_MS },
    ],
  });
  if (!limited.allowed) {
    return finish(
      failure(
        'rate_limited',
        { retry_after: limited.retryAfter },
        { 'Retry-After': String(limited.retryAfter) },
      ),
      'rate_limited',
    );
  }

  // 4. body
  const text = await readBodyCapped(request, MAX_BODY_BYTES);
  if (text === null) return finish(failure('bad_request'), 'too_large');
  let hp: unknown;
  let rawLocale: unknown;
  let input: Record<string, unknown>;
  let elapsed: number | undefined;
  if (mode === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return finish(failure('bad_request'), 'bad_json');
    }
    if (!isObject(parsed)) return finish(failure('bad_request'), 'bad_json');
    hp = parsed.hp;
    rawLocale = parsed.locale;
    // An unusable elapsedMs is "missing" (suspected), never a rejection.
    const e = parsed.elapsedMs;
    elapsed = typeof e === 'number' && Number.isInteger(e) && e >= 0 ? e : undefined;
    input = { locale: parsed.locale, fields: parsed.fields, hp: parsed.hp, elapsedMs: elapsed };
  } else {
    const decoded = decodeUrlencoded(new URLSearchParams(text));
    if (!decoded.ok) {
      return finish(failure('bad_request'), 'bad_form');
    }
    hp = decoded.value.hp;
    rawLocale = decoded.value.locale;
    input = {
      locale: decoded.value.locale,
      fields: { ...decoded.value.fields },
      hp: decoded.value.hp,
    };
  }
  if (isLocale(rawLocale)) pageLocale = rawLocale;

  // 5. honeypot: silent fake success, nothing stored or sent
  if (isHoneypotHit(hp)) return finish(success(), 'honeypot');

  // 6. enrolment availability
  if (kind === 'application' && deps.settings.availability === 'closed')
    return finish(failure('closed'), 'closed');

  // 7. validation and normalisation
  const validated = kind === 'contact' ? validateContact(input) : validateApplication(input);
  if (!validated.ok)
    return finish(failure('validation', { fields: validated.fields }), 'validation');
  const data = validated.data as { locale: Locale; fields: Record<string, unknown> };
  const fields = data.fields as Record<string, unknown> & { email: string; region: string };
  const locale = data.locale;

  if (kind === 'application' && deps.settings.applicationYears) {
    if (!deps.settings.applicationYears.includes(String(fields.intended_school_year))) {
      return finish(
        failure('validation', { fields: { intended_school_year: 'school_year_invalid' } }),
        'school_year',
      );
    }
  }

  // 8. marketing consent: ignored unless enabled; the version must be current
  const wantsConsent = cfg.marketingConsentEnabled && fields.marketing_consent === true;
  if (wantsConsent) {
    const current = deps.settings.marketing.textVersion;
    if (!current || fields.marketing_consent_text_version !== current) {
      return finish(
        failure('validation', { fields: { marketing_consent: 'consent_version_stale' } }),
        'consent_stale',
      );
    }
  }

  // 9. heuristics: stored as suspected, never rejected
  const urlCount = countUrls(
    Object.values(fields)
      .filter((v): v is string => typeof v === 'string')
      .join(' \n '),
  );
  const suspectedTiming =
    mode === 'json' && (elapsed === undefined || elapsed <= 0 || isTooFast(elapsed, MIN_FILL_MS));
  const suspected = suspectedTiming || urlCount > MAX_URLS;

  // 10. recipient limit (mail-bombing, ADR-0001 A2): checked and counted only when a confirmation
  // would actually be queued. Over the limit the submission is still stored; only the confirmation
  // is skipped. Never a 429, which would tell an attacker the address is being targeted.
  let confirmation: 'queued' | 'skipped' | 'recipient_limit' = suspected ? 'skipped' : 'queued';
  if (!suspected) {
    const rcptHash = await hmacHex(cfg.ipHashSecret, 'rcpt', fields.email);
    const rcpt = await checkRateLimit(env.DB, {
      now: nowMs,
      checks: [{ key: `rcpt:${rcptHash}:day`, limit: cfg.rateLimit.emailPerDay, windowMs: DAY_MS }],
    });
    if (!rcpt.allowed) confirmation = 'recipient_limit';
  }

  // 11. write
  const nowIso = deps.now().toISOString();
  const retainDays = kind === 'contact' ? cfg.retention.inquiryDays : cfg.retention.applicationDays;
  const recordId = deps.uuid();
  const sub: SubmissionMeta = {
    id: recordId,
    now: nowIso,
    locale,
    privacyNoticeVersion: deps.settings.privacyNoticeVersion,
    suspectedSpam: suspected,
    retainUntil: new Date(deps.now().getTime() + retainDays * DAY_MS).toISOString(),
  };
  const type = kind === 'contact' ? 'inquiry' : 'application';
  const senderDeliveryId = deps.uuid();
  const adminDeliveryId = deps.uuid();
  const statements = [
    // The shared validator types the output as the union; the kind decides the shape.
    kind === 'contact'
      ? insertInquiry(env.DB, sub, fields as never)
      : insertApplication(env.DB, sub, fields as never),
    insertDelivery(env.DB, {
      id: senderDeliveryId,
      kind: 'sender_confirmation',
      type,
      recordId,
      status: confirmation === 'queued' ? 'queued' : 'skipped',
      errorCode: confirmation === 'recipient_limit' ? 'recipient_limit' : undefined,
      now: nowIso,
    }),
    insertDelivery(env.DB, {
      id: adminDeliveryId,
      kind: 'admin_notification',
      type,
      recordId,
      status: 'queued',
      now: nowIso,
    }),
  ];
  if (wantsConsent) {
    statements.push(
      insertConsent(env.DB, {
        id: deps.uuid(),
        email: fields.email,
        locale,
        purpose: deps.settings.marketing.purpose?.[locale] ?? 'marketing_communications',
        version: String(fields.marketing_consent_text_version),
        now: nowIso,
        source: kind === 'contact' ? 'contact' : 'application',
        recordId,
        retainUntil: sub.retainUntil,
      }),
    );
  }
  await env.DB.batch(statements);

  // 12. emails after the commit
  const subject: EmailSubject = {
    type,
    id: recordId,
    email: fields.email,
    recordLocale: locale,
    confirmationLocale: kind === 'application' ? (fields.preferred_language as Locale) : locale,
    region: fields.region,
    subject: kind === 'contact' ? String(fields.subject) : undefined,
    grade: kind === 'application' ? Number(fields.intended_grade) : undefined,
    nextStep: kind === 'application' ? String(fields.preferred_next_step) : undefined,
    suspectedSpam: suspected,
  };
  ctx.waitUntil(
    (async () => {
      const emails = composeEmails(cfg, deps, subject);
      const transport = buildTransport(cfg, deps);
      const jobs = [
        sendAndRecord(env.DB, transport, adminDeliveryId, emails.admin, deps.now, ctx.requestId),
      ];
      if (confirmation === 'queued')
        jobs.push(
          sendAndRecord(
            env.DB,
            transport,
            senderDeliveryId,
            emails.confirmation,
            deps.now,
            ctx.requestId,
          ),
        );
      await Promise.all(jobs);
    })(),
  );

  return finish(success(), suspected ? 'created_suspected' : 'created');
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
