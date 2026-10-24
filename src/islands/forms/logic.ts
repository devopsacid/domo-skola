/**
 * Pure logic of the form islands: values -> shared-schema input, validation per step,
 * error text lookup, the review model and the retry-time wording. No DOM, no Preact.
 */
import {
  APPLICATION_STEP_FIELDS,
  validateApplicationStep,
  type ApplicationStep,
} from '../../shared/schemas/application';
import { validateContactFields } from '../../shared/schemas/contact';
import type { FieldErrors } from '../../shared/schemas/common';
import type { FormStrings } from '../../i18n/forms';

/** Text and radio values are strings, checkboxes are booleans. */
export type Values = Record<string, string | boolean>;
export type Errors = Record<string, string>;
export interface Option {
  value: string;
  label: string;
}
export interface CheckOptions {
  /** Version of the marketing text that is on screen (sent only when the box is ticked). */
  marketingVersion?: string;
}

/** Values -> the object the shared schemas and the API expect: blanks and unticked boxes are left out. */
export function buildFields(values: Values, opts: CheckOptions = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'boolean') {
      if (v) out[k] = true;
    } else if (v.trim() !== '') out[k] = v;
  }
  if (out.marketing_consent === true && opts.marketingVersion) {
    out.marketing_consent_text_version = opts.marketingVersion;
  } else {
    delete out.marketing_consent_text_version;
  }
  return out;
}

const codes = (r: { ok: true } | { ok: false; fields: FieldErrors }): Errors =>
  r.ok ? {} : { ...r.fields };

export function validateContactValues(values: Values, opts: CheckOptions = {}): Errors {
  return codes(validateContactFields(buildFields(values, opts)));
}

export interface StepOptions extends CheckOptions {
  /** Verified `applicationYears` only; null or empty means no restriction (same rule as the server). */
  years?: readonly string[] | null;
}

export function validateEnrolStep(
  step: ApplicationStep,
  values: Values,
  opts: StepOptions = {},
): Errors {
  const fields = buildFields(values, opts);
  const errors = codes(validateApplicationStep(step, fields));
  if (step === 2 && !errors.intended_school_year && opts.years && opts.years.length > 0) {
    const year = String(fields.intended_school_year ?? '').trim();
    if (!opts.years.includes(year)) errors.intended_school_year = 'school_year_invalid';
  }
  return errors;
}

export function validateEnrolAll(values: Values, opts: StepOptions = {}): Errors {
  const all: Errors = {};
  for (const step of [1, 2, 3, 4] as const)
    Object.assign(all, validateEnrolStep(step, values, opts));
  return all;
}

export function stepOfField(name: string): ApplicationStep | null {
  for (const step of [1, 2, 3, 4] as const) {
    if ((APPLICATION_STEP_FIELDS[step] as readonly string[]).includes(name)) return step;
  }
  return null;
}

export function firstStepWithErrors(errors: Errors): ApplicationStep | null {
  let first: ApplicationStep | null = null;
  for (const name of Object.keys(errors)) {
    const s = stepOfField(name);
    if (s !== null && (first === null || s < first)) first = s;
  }
  return first;
}

/** Message for a code; anything unknown degrades to the generic text, never to a raw code. */
export function errorMessage(errors: FormStrings['common']['errors'], code: string): string {
  return (errors as Record<string, string>)[code] ?? errors.invalid_type;
}

export interface SummaryItem {
  name: string;
  target: string;
  text: string;
}

/** Error-summary entries in form order; an error on an unknown field is left out (shown elsewhere). */
export function summaryItems(
  errors: Errors,
  order: readonly string[],
  labelOf: (name: string) => string,
  messages: FormStrings['common']['errors'],
  targetOf: (name: string) => string,
): SummaryItem[] {
  return order
    .filter((n) => errors[n])
    .map((n) => ({
      name: n,
      target: targetOf(n),
      text: `${labelOf(n)}: ${errorMessage(messages, errors[n] as string)}`,
    }));
}

export function formatRetry(
  seconds: number | undefined,
  time: FormStrings['common']['time'],
): string {
  if (!seconds || seconds <= 0) return time.soon;
  if (seconds < 60) return time.seconds.replace('{n}', String(Math.ceil(seconds)));
  return time.minutes.replace('{n}', String(Math.ceil(seconds / 60)));
}

export interface ReviewRow {
  name: string;
  label: string;
  value: string;
}
export interface ReviewSection {
  step: 1 | 2 | 3;
  title: string;
  editLabel: string;
  rows: ReviewRow[];
}

const REVIEW_FIELDS: Record<1 | 2 | 3, readonly string[]> = {
  1: ['parent_name', 'email', 'phone', 'municipality', 'region', 'preferred_language'],
  2: ['child_name', 'intended_grade', 'intended_school_year', 'current_arrangement'],
  3: ['motivation', 'environment_priorities', 'questions', 'preferred_next_step'],
};

export function reviewSections(
  values: Values,
  enrol: FormStrings['enrol'],
  common: FormStrings['common'],
  regions: readonly Option[],
): ReviewSection[] {
  const lookup: Record<string, Record<string, string>> = {
    region: Object.fromEntries(regions.map((r) => [r.value, r.label])),
    preferred_language: common.languageNames,
    intended_grade: enrol.grades,
    current_arrangement: enrol.arrangements,
    preferred_next_step: enrol.nextSteps,
  };
  const fieldLabels = enrol.fields as Record<string, { label: string }>;
  return ([1, 2, 3] as const).map((step) => ({
    step,
    title: enrol.stepTitles[step - 1] as string,
    editLabel: enrol.review.editLabels[step - 1] as string,
    rows: REVIEW_FIELDS[step].map((name) => {
      const raw = String(values[name] ?? '').trim();
      const shown = raw === '' ? enrol.review.empty : (lookup[name]?.[raw] ?? raw);
      return { name, label: fieldLabels[name]?.label ?? name, value: shown };
    }),
  }));
}

export interface Failure {
  kind: 'network' | 'server' | 'rate' | 'closed' | 'stale' | 'generic';
  retryAfter?: number;
}

/** Title and text of the failure panel; the rate-limit text carries the formatted retry time. */
export function failureCopy(
  common: FormStrings['common'],
  f: Failure,
): { title: string; text: string } {
  const c = common.fail[f.kind];
  return {
    title: c.title,
    text: c.text.replace('{time}', formatRetry(f.retryAfter, common.time)),
  };
}
