import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RETENTION_KEYS,
  detectProduction,
  parseJsonc,
  preflight,
} from '../../tools/lib/preflight.mjs';

const wrangler = parseJsonc(readFileSync(resolve('wrangler.jsonc'), 'utf8'));
const devVarsExample = readFileSync(resolve('.dev.vars.example'), 'utf8');
const goodEnv: Record<string, string> = {
  SITE_URL: 'https://example.sk',
  ALLOWED_ORIGINS: 'https://example.sk',
  ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com',
  ACCESS_AUD: 'abc',
  EMAIL_PROVIDER: 'brevo',
  CONTENT_STRICT: '1',
  RETENTION_DAYS_INQUIRY: '365',
  RETENTION_DAYS_APPLICATION: '365',
  RETENTION_DAYS_AFTER_CLOSE: '90',
  AUDIT_RETENTION_DAYS: '730',
};
const realDb = {
  ...wrangler,
  env: {
    ...wrangler.env,
    production: {
      ...wrangler.env.production,
      d1_databases: [{ binding: 'DB', database_id: 'a1b2c3d4-0000-4000-8000-000000000001' }],
    },
  },
};
const run = (env: Record<string, string | undefined>, production = true, w = realDb) =>
  preflight({ production, env, wrangler: w, devVarsExample });

describe('parseJsonc', () => {
  it('keeps // inside strings and drops comments and trailing commas', () => {
    expect(parseJsonc('{ // c\n "a": "http://x", /* b */ "b": [1,],\n}')).toEqual({
      a: 'http://x',
      b: [1],
    });
  });
  it('parses the repo wrangler.jsonc', () => {
    expect(wrangler.pages_build_output_dir).toBe('dist');
  });
});

describe('preflight', () => {
  it('passes a complete production config', () => {
    expect(run(goodEnv).errors).toEqual([]);
  });
  it.each(RETENTION_KEYS)('fails in production when %s is missing', (k) => {
    const env = { ...goodEnv, [k]: undefined };
    expect(run(env).errors.join()).toContain(k);
  });
  it('fails on a non-numeric retention value', () => {
    expect(run({ ...goodEnv, RETENTION_DAYS_INQUIRY: 'abc' }).errors.join()).toContain(
      'positive integer',
    );
  });
  it('fails when ACCESS_CERTS_URL is set in production', () => {
    expect(
      run({ ...goodEnv, ACCESS_CERTS_URL: 'http://localhost:1/certs' }).errors.join(),
    ).toContain('ACCESS_CERTS_URL');
  });
  it('fails when wrangler.jsonc defines ACCESS_CERTS_URL even outside production mode', () => {
    const w = { ...realDb, vars: { ACCESS_CERTS_URL: 'x' } };
    expect(run({}, false, w).errors.join()).toContain('ACCESS_CERTS_URL');
  });
  it('fails on placeholders, mock mail, http origin, missing CONTENT_STRICT', () => {
    const e = run(
      {
        ...goodEnv,
        EMAIL_PROVIDER: 'mock',
        SITE_URL: 'http://localhost:8788',
        CONTENT_STRICT: '0',
      },
      true,
      wrangler,
    ).errors.join('\n');
    expect(e).toContain('not mock');
    expect(e).toContain('SITE_URL must be an https');
    expect(e).toContain('CONTENT_STRICT');
    expect(e).toContain('database_id');
  });
  it('fails a production build with SITE_URL unset or localhost', () => {
    expect(run({ ...goodEnv, SITE_URL: undefined }).errors.join()).toContain(
      'SITE_URL build variable',
    );
    expect(run({ ...goodEnv, SITE_URL: 'http://localhost:4321' }).errors.join()).toContain(
      'SITE_URL must be an https',
    );
  });
  it('only warns about retention outside production', () => {
    const r = run({}, false);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(4);
  });
  it('flags a bad _redirects and _routes.json', () => {
    const r = preflight({
      production: false,
      env: {},
      wrangler,
      redirects: '/a /b 302',
      routes: { version: 1, include: ['/*'] },
    });
    expect(r.errors.length).toBe(2);
  });
});

describe('detectProduction (fails closed)', () => {
  it.each(['production', 'PRODUCTION', ' Production ', 'production\t'])(
    'treats ENVIRONMENT=%j as production',
    (v) => {
      expect(detectProduction({ env: { ENVIRONMENT: v } }).production).toBe(true);
    },
  );
  it('accepts development, preview and empty as non-production', () => {
    for (const v of ['development', ' PREVIEW ', ''])
      expect(detectProduction({ env: { ENVIRONMENT: v } })).toEqual({ production: false });
    expect(detectProduction({ env: {} })).toEqual({ production: false });
  });
  it('errors on an unrecognised value', () => {
    expect(detectProduction({ env: { ENVIRONMENT: 'prod' } }).error).toMatch(/unrecognised/);
    expect(detectProduction({ env: { ENVIRONMENT: 'staging' } }).error).toBeDefined();
  });
  it('treats a Cloudflare Pages build of the production branch as production', () => {
    expect(detectProduction({ env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' } }).production).toBe(
      true,
    );
    expect(
      detectProduction({ env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', ENVIRONMENT: 'preview' } })
        .production,
    ).toBe(true);
    expect(
      detectProduction({ env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'feature/x' } }).production,
    ).toBe(false);
    expect(
      detectProduction({
        env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'release', PRODUCTION_BRANCH: 'release' },
      }).production,
    ).toBe(true);
    expect(
      detectProduction({
        env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PRODUCTION_BRANCH: 'release' },
      }).production,
    ).toBe(false);
  });
  it('honours --production', () => {
    expect(detectProduction({ argv: ['--production'], env: {} }).production).toBe(true);
  });
});
