/** Permission matrix (docs/architecture.md section 6). Access says who may enter; D1 says what they may do. */
import type { AdminRole } from '../../shared/admin-api';

export const PERMISSIONS = [
  'records.list',
  'records.view',
  'records.status',
  'records.note',
  'records.resend',
  'retention.view',
  'export',
  'records.delete',
  'retention.purge',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const COORDINATOR: ReadonlySet<Permission> = new Set([
  'records.list',
  'records.view',
  'records.status',
  'records.note',
  'records.resend',
  'retention.view',
]);

export function can(role: AdminRole, permission: Permission): boolean {
  if (!(PERMISSIONS as readonly string[]).includes(permission)) return false;
  if (role === 'admin') return true;
  if (role === 'coordinator') return COORDINATOR.has(permission);
  return false;
}
