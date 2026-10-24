/**
 * Shared enumerations. Mirrored as SQL CHECK constraints in migrations/
 * (parity test: tests/unit/enums.test.ts). Keys of ENUMS are SQL column names.
 */
export const LOCALES = ['sk', 'cs', 'en'] as const;
export const REGIONS = ['banska_bystrica', 'ruzomberok', 'liptovsky_mikulas', 'other'] as const;
export const CONTACT_SUBJECTS = ['general', 'visit', 'enrollment', 'other'] as const;
export const GRADES = [1, 2, 3, 4] as const;
export const INQUIRY_STATUSES = ['new', 'contacted', 'closed'] as const;
export const APPLICATION_STATUSES = [
  'new',
  'contacted',
  'meeting_planned',
  'in_discussion',
  'accepted',
  'waitlisted',
  'closed',
] as const;
export const CURRENT_ARRANGEMENTS = [
  'kindergarten',
  'registered_school',
  'individual_education',
  'other',
  'prefer_not_say',
] as const;
export const NEXT_STEPS = ['call', 'visit', 'info'] as const;
export const ADMIN_ROLES = ['admin', 'coordinator'] as const;
export const EMAIL_KINDS = ['sender_confirmation', 'admin_notification'] as const;
export const EMAIL_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export const AUDIT_ACTIONS = [
  'view',
  'status_change',
  'note_add',
  'email_resend',
  'export',
  'delete',
  'retention_purge',
] as const;
export const AUDIT_SUBJECT_TYPES = ['inquiry', 'application', 'bulk'] as const;
export const CONSENT_SOURCES = ['contact', 'application'] as const;
export const CONTENT_STATUSES = ['draft', 'needs-review', 'verified'] as const;
export const ENROLLMENT_AVAILABILITY = ['open', 'waitlist', 'closed'] as const;

export type Locale = (typeof LOCALES)[number];
export type Region = (typeof REGIONS)[number];
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
export type Grade = (typeof GRADES)[number];
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** SQL column name -> allowed values, for the parity test against migrations. */
export const ENUMS: Record<string, readonly (string | number)[]> = {
  locale: LOCALES,
  preferred_language: LOCALES,
  region: REGIONS,
  subject: CONTACT_SUBJECTS,
  intended_grade: GRADES,
  inquiry_status: INQUIRY_STATUSES,
  application_status: APPLICATION_STATUSES,
  current_arrangement: CURRENT_ARRANGEMENTS,
  preferred_next_step: NEXT_STEPS,
  role: ADMIN_ROLES,
  kind: EMAIL_KINDS,
  email_status: EMAIL_STATUSES,
  action: AUDIT_ACTIONS,
  subject_type: AUDIT_SUBJECT_TYPES,
  source: CONSENT_SOURCES,
};

/**
 * Extract `CHECK(col IN ('a','b'))` lists from SQL, keyed by column name.
 * Ambiguous columns (e.g. `status`) are not in ENUMS and are skipped by the parity test.
 */
export function extractSqlChecks(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/gi;
  for (const m of sql.matchAll(re)) {
    const col = m[1];
    const list = m[2];
    if (!col || list === undefined) continue;
    out[col] = [...list.matchAll(/'([^']*)'/g)].map((x) => x[1] as string);
  }
  return out;
}
