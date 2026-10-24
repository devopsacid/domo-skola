import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { ENUMS, extractSqlChecks } from '../../src/shared/enums';

describe('extractSqlChecks', () => {
  it('reads CHECK(col IN (...)) and pipe lists', () => {
    const sql = `CREATE TABLE t(
      locale TEXT NOT NULL CHECK(locale IN ('sk','cs','en')),
      status TEXT CHECK (status IN ('new', 'closed')) DEFAULT 'new'
    );`;
    expect(extractSqlChecks(sql)).toEqual({ locale: ['sk', 'cs', 'en'], status: ['new', 'closed'] });
  });
});

describe('enum parity with SQL CHECK constraints (stubbed until migrations exist)', () => {
  const dir = new URL('../../migrations/', import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')) : [];

  it.skipIf(files.length === 0)('every SQL CHECK list matches a shared enum', () => {
    const sql = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
    const checks = extractSqlChecks(sql);
    for (const [column, values] of Object.entries(checks)) {
      const enumValues = ENUMS[column];
      if (enumValues) expect([...enumValues].sort(), column).toEqual([...values].sort());
    }
  });

  it('exposes enum values as non-empty unique lists', () => {
    for (const [name, values] of Object.entries(ENUMS)) {
      expect(values.length, name).toBeGreaterThan(0);
      expect(new Set(values).size, name).toBe(values.length);
    }
  });

  it('matches the architecture data model for core enums', () => {
    expect(ENUMS.region).toEqual(['banska_bystrica', 'ruzomberok', 'liptovsky_mikulas', 'other']);
    expect(ENUMS.application_status).toContain('waitlisted');
    expect(ENUMS.inquiry_status).toEqual(['new', 'contacted', 'closed']);
  });
});
