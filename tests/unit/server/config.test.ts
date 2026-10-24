import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../../../src/server/config';

const base = {
  ENVIRONMENT: 'development',
  SITE_URL: 'http://localhost:8788',
  ALLOWED_ORIGINS: 'http://localhost:8788, http://localhost:4321/',
  IP_HASH_SECRET: 'x'.repeat(16),
  RETENTION_DAYS_INQUIRY: '30',
  RETENTION_DAYS_APPLICATION: '60',
  RETENTION_DAYS_AFTER_CLOSE: '10',
  AUDIT_RETENTION_DAYS: '90',
  EMAIL_PROVIDER: 'mock',
};

describe('parseConfig', () => {
  it('parses a valid environment with defaults', () => {
    const c = parseConfig(base);
    expect(c.allowedOrigins).toEqual(['http://localhost:8788', 'http://localhost:4321']);
    expect(c.rateLimit).toEqual({ per10min: 5, perDay: 20, emailPerDay: 3 });
    expect(c.retention).toEqual({ inquiryDays: 30, applicationDays: 60, afterCloseDays: 10, auditDays: 90 });
    expect(c.marketingConsentEnabled).toBe(false);
    expect(c.adminEmailLocale).toBe('sk');
  });
  it('enables marketing consent only for the exact string "true"', () => {
    expect(parseConfig({ ...base, MARKETING_CONSENT_ENABLED: 'true' }).marketingConsentEnabled).toBe(true);
    for (const v of ['TRUE', '1', 'yes', ' true', 'false', '']) {
      expect(parseConfig({ ...base, MARKETING_CONSENT_ENABLED: v }).marketingConsentEnabled).toBe(false);
    }
  });
  it('fails closed on missing or invalid values, naming variables but never values', () => {
    for (const k of ['SITE_URL', 'IP_HASH_SECRET', 'RETENTION_DAYS_INQUIRY', 'AUDIT_RETENTION_DAYS', 'ENVIRONMENT']) {
      const env: Record<string, string | undefined> = { ...base };
      delete env[k];
      expect(() => parseConfig(env)).toThrow(ConfigError);
    }
    try {
      parseConfig({ ...base, IP_HASH_SECRET: 'short-secret' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).vars).toContain('IP_HASH_SECRET');
      expect(String((e as Error).message)).not.toContain('short-secret');
    }
    expect(() => parseConfig({ ...base, RETENTION_DAYS_INQUIRY: '-1' })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, RETENTION_DAYS_INQUIRY: '1.5' })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, EMAIL_PROVIDER: 'carrier-pigeon' })).toThrow(ConfigError);
  });
  it('refuses ACCESS_CERTS_URL in production and mock mail in production', () => {
    const prod = { ...base, ENVIRONMENT: 'production', EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'k' };
    expect(() => parseConfig({ ...prod, ACCESS_CERTS_URL: 'http://localhost:8790/certs' })).toThrow(ConfigError);
    expect(() => parseConfig({ ...prod, EMAIL_PROVIDER: 'mock' })).toThrow(ConfigError);
    expect(parseConfig(prod).environment).toBe('production');
  });
});
