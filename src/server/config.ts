/**
 * Environment parsing. Runs at the start of each request and fails closed: a ConfigError carries
 * variable NAMES only, never values (docs/architecture.md section 9).
 */
import * as z from 'zod/mini';
import { LOCALES, type Locale } from '../shared/enums';

export class ConfigError extends Error {
  readonly vars: string[];
  constructor(vars: string[]) {
    super(`invalid configuration: ${vars.join(', ')}`);
    this.name = 'ConfigError';
    this.vars = vars;
  }
}

export interface Config {
  environment: 'development' | 'preview' | 'production';
  siteUrl: string;
  allowedOrigins: string[];
  access: { teamDomain?: string; aud?: string; certsUrl?: string };
  email: {
    provider: 'brevo' | 'mock';
    apiKey?: string;
    apiBase?: string;
    from?: string;
    replyTo?: string;
    adminNotifyTo?: string;
  };
  adminEmailLocale: Locale;
  ipHashSecret: string;
  rateLimit: { per10min: number; perDay: number; emailPerDay: number };
  retention: {
    inquiryDays: number;
    applicationDays: number;
    afterCloseDays: number;
    auditDays: number;
  };
  marketingConsentEnabled: boolean;
  github: { clientId?: string; clientSecret?: string };
  analytics: { provider: string; domain?: string; upstream?: string };
}

const str = z.optional(z.string());
const rawSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'preview', 'production']),
  SITE_URL: z.string().check(z.minLength(1)),
  ALLOWED_ORIGINS: str,
  ACCESS_TEAM_DOMAIN: str,
  ACCESS_AUD: str,
  ACCESS_CERTS_URL: str,
  EMAIL_PROVIDER: z.enum(['brevo', 'mock']),
  EMAIL_API_KEY: str,
  EMAIL_API_BASE: str,
  EMAIL_FROM: str,
  EMAIL_REPLY_TO: str,
  ADMIN_NOTIFY_TO: str,
  ADMIN_EMAIL_LOCALE: str,
  IP_HASH_SECRET: z.string().check(z.minLength(16)),
  MARKETING_CONSENT_ENABLED: str,
  GITHUB_OAUTH_CLIENT_ID: str,
  GITHUB_OAUTH_CLIENT_SECRET: str,
  PUBLIC_ANALYTICS_PROVIDER: str,
  PUBLIC_ANALYTICS_DOMAIN: str,
  ANALYTICS_UPSTREAM: str,
});

const nonNegInt = (v: unknown, fallback?: number): number | undefined => {
  if (v === undefined || v === '') return fallback;
  if (typeof v !== 'string' || !/^\d{1,6}$/.test(v)) return undefined;
  return Number(v);
};

function origin(value: string): string | undefined {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Empty strings in `.dev.vars` mean "unset". */
const blankless = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

export function parseConfig(env: Record<string, unknown>): Config {
  const bad = new Set<string>();
  const input: Record<string, unknown> = {};
  for (const k of Object.keys(rawSchema.shape)) input[k] = blankless(env[k]);
  const parsed = rawSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) bad.add(String(issue.path[0]));
    // Required keys fail with their own names; the rest of the checks still run for a complete list.
  }
  const raw = (parsed.success ? parsed.data : input) as Record<string, string | undefined>;

  const siteUrl = raw.SITE_URL ? origin(raw.SITE_URL) : undefined;
  if (!siteUrl) bad.add('SITE_URL');
  const allowed = (raw.ALLOWED_ORIGINS ?? raw.SITE_URL ?? '')
    .split(',')
    .map((s) => origin(s))
    .filter((s): s is string => !!s);
  if (allowed.length === 0) bad.add('ALLOWED_ORIGINS');

  const retention = {
    inquiryDays: nonNegInt(env.RETENTION_DAYS_INQUIRY),
    applicationDays: nonNegInt(env.RETENTION_DAYS_APPLICATION),
    afterCloseDays: nonNegInt(env.RETENTION_DAYS_AFTER_CLOSE),
    auditDays: nonNegInt(env.AUDIT_RETENTION_DAYS),
  };
  // No retention default is invented (docs/architecture.md section 7): all four must be set.
  if (retention.inquiryDays === undefined) bad.add('RETENTION_DAYS_INQUIRY');
  if (retention.applicationDays === undefined) bad.add('RETENTION_DAYS_APPLICATION');
  if (retention.afterCloseDays === undefined) bad.add('RETENTION_DAYS_AFTER_CLOSE');
  if (retention.auditDays === undefined) bad.add('AUDIT_RETENTION_DAYS');

  const rl = {
    per10min: nonNegInt(blankless(env.RATE_LIMIT_PER_10MIN), 5),
    perDay: nonNegInt(blankless(env.RATE_LIMIT_PER_DAY), 20),
    emailPerDay: nonNegInt(blankless(env.RATE_LIMIT_EMAIL_PER_DAY), 3),
  };
  if (rl.per10min === undefined) bad.add('RATE_LIMIT_PER_10MIN');
  if (rl.perDay === undefined) bad.add('RATE_LIMIT_PER_DAY');
  if (rl.emailPerDay === undefined) bad.add('RATE_LIMIT_EMAIL_PER_DAY');

  const adminLocale = raw.ADMIN_EMAIL_LOCALE ?? 'sk';
  if (!(LOCALES as readonly string[]).includes(adminLocale)) bad.add('ADMIN_EMAIL_LOCALE');

  if (raw.ENVIRONMENT === 'production') {
    if (raw.ACCESS_CERTS_URL) bad.add('ACCESS_CERTS_URL');
    if (raw.EMAIL_PROVIDER === 'mock') bad.add('EMAIL_PROVIDER');
  }

  if (bad.size > 0) throw new ConfigError([...bad]);

  return {
    environment: raw.ENVIRONMENT as Config['environment'],
    siteUrl: siteUrl as string,
    allowedOrigins: allowed,
    access: {
      teamDomain: raw.ACCESS_TEAM_DOMAIN,
      aud: raw.ACCESS_AUD,
      certsUrl: raw.ACCESS_CERTS_URL,
    },
    email: {
      provider: raw.EMAIL_PROVIDER as 'brevo' | 'mock',
      apiKey: raw.EMAIL_API_KEY,
      apiBase: raw.EMAIL_API_BASE,
      from: raw.EMAIL_FROM,
      replyTo: raw.EMAIL_REPLY_TO,
      adminNotifyTo: raw.ADMIN_NOTIFY_TO,
    },
    adminEmailLocale: adminLocale as Locale,
    ipHashSecret: raw.IP_HASH_SECRET as string,
    rateLimit: rl as Config['rateLimit'],
    retention: retention as Config['retention'],
    marketingConsentEnabled: env.MARKETING_CONSENT_ENABLED === 'true',
    github: { clientId: raw.GITHUB_OAUTH_CLIENT_ID, clientSecret: raw.GITHUB_OAUTH_CLIENT_SECRET },
    analytics: {
      provider: raw.PUBLIC_ANALYTICS_PROVIDER ?? 'none',
      domain: raw.PUBLIC_ANALYTICS_DOMAIN,
      upstream: raw.ANALYTICS_UPSTREAM,
    },
  };
}
