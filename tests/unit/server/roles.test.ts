import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can } from '../../../src/server/auth/roles';

describe('role matrix (docs/architecture.md section 6)', () => {
  const both = ['records.list', 'records.view', 'records.status', 'records.note', 'records.resend', 'retention.view'] as const;
  const adminOnly = ['export', 'records.delete', 'retention.purge', 'audit.view'] as const;

  it.each(both)('%s is allowed for coordinator and admin', (p) => {
    expect(can('coordinator', p)).toBe(true);
    expect(can('admin', p)).toBe(true);
  });
  it.each(adminOnly)('%s is admin only', (p) => {
    expect(can('admin', p)).toBe(true);
    expect(can('coordinator', p)).toBe(false);
  });
  it('covers every permission and denies unknown roles and permissions', () => {
    expect([...both, ...adminOnly].sort()).toEqual([...PERMISSIONS].sort());
    expect(can('guest' as never, 'records.list')).toBe(false);
    expect(can('admin', 'records.everything' as never)).toBe(false);
  });
});
