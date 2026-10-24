import { describe, expect, it } from 'vitest';
import { auditStatement } from '../../../src/server/db/audit';

function capture(details: Record<string, unknown> | undefined) {
  let binds: unknown[] = [];
  const db = {
    prepare: () => ({
      bind: (...v: unknown[]) => {
        binds = v;
        return {} as never;
      },
    }),
  } as never;
  auditStatement(db, {
    at: 't',
    actorEmail: 'a@b.sk',
    actorRole: 'admin',
    action: 'view',
    subjectType: 'bulk',
    details,
    requestId: 'r',
  });
  return binds[6] as string | null;
}

describe('auditStatement details', () => {
  it('stores small details as is and absent details as NULL', () => {
    expect(capture({ a: 1 })).toBe('{"a":1}');
    expect(capture(undefined)).toBeNull();
  });
  it('truncates structurally: oversized details stay valid JSON within the column limit', () => {
    const out = capture({ big: 'x'.repeat(5000), other: 1 }) as string;
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(JSON.parse(out)).toMatchObject({ truncated: true });
  });
});
