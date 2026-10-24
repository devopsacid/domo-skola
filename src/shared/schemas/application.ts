/**
 * Enrolment form (brief section 7): four steps plus a full-submission schema.
 * Collects only what the initial application needs. No birth numbers, diagnoses or
 * behavioural history; unknown keys are stripped by the schemas.
 */
import * as z from 'zod/mini';
import { CURRENT_ARRANGEMENTS, LOCALES, NEXT_STEPS, REGIONS } from '../enums';
import {
  LIMITS,
  consentVersionField,
  consentVersionRule,
  emailField,
  enumField,
  envelope,
  gradeField,
  lineField,
  nameField,
  optionalEnumField,
  optionalTickField,
  phoneField,
  schoolYearField,
  textField,
  tickField,
  validate,
} from './common';

/**
 * Brief section 7 step 1 lists phone without "optional", so it is required.
 * The owner may relax it: flip this one flag (or pass `phoneRequired`) and nothing else changes.
 */
export const APPLICATION_PHONE_REQUIRED = true;

export const APPLICATION_STEPS = [1, 2, 3, 4] as const;
export type ApplicationStep = (typeof APPLICATION_STEPS)[number];

export function createApplicationSchemas(opts: { phoneRequired: boolean }) {
  const phone = phoneField({ required: opts.phoneRequired });

  const step1 = z.object({
    parent_name: nameField(LIMITS.parent_name),
    email: emailField(),
    phone,
    municipality: lineField(LIMITS.municipality, { required: true }),
    region: enumField(REGIONS),
    preferred_language: enumField(LOCALES),
  });

  const step2 = z.object({
    child_name: nameField(LIMITS.child_name),
    intended_grade: gradeField(),
    intended_school_year: schoolYearField(),
    current_arrangement: optionalEnumField(CURRENT_ARRANGEMENTS),
  });

  const step3 = z.object({
    motivation: textField(LIMITS.longText, { required: false }),
    environment_priorities: textField(LIMITS.longText, { required: false }),
    questions: textField(LIMITS.longText, { required: false }),
    preferred_next_step: enumField(NEXT_STEPS),
  });

  const step4Shape = {
    privacy_ack: tickField('privacy_ack_required'),
    marketing_consent: optionalTickField(),
    marketing_consent_text_version: consentVersionField(),
  };
  const step4 = z.object(step4Shape).check(consentVersionRule());

  const applicationFieldsSchema = z
    .object({ ...step1.shape, ...step2.shape, ...step3.shape, ...step4Shape })
    .check(consentVersionRule());

  return {
    applicationStep1Schema: step1,
    applicationStep2Schema: step2,
    applicationStep3Schema: step3,
    applicationStep4Schema: step4,
    applicationFieldsSchema,
    applicationRequestSchema: envelope(applicationFieldsSchema),
  };
}

const defaults = createApplicationSchemas({ phoneRequired: APPLICATION_PHONE_REQUIRED });
export const {
  applicationStep1Schema,
  applicationStep2Schema,
  applicationStep3Schema,
  applicationStep4Schema,
  applicationFieldsSchema,
  applicationRequestSchema,
} = defaults;

/** Field names owned by each step; the island uses this to focus the first invalid step. */
export const APPLICATION_STEP_FIELDS = {
  1: Object.keys(applicationStep1Schema.shape),
  2: Object.keys(applicationStep2Schema.shape),
  3: Object.keys(applicationStep3Schema.shape),
  4: Object.keys(applicationStep4Schema.shape),
} as const satisfies Record<ApplicationStep, string[]>;

export type ApplicationFieldsInput = z.input<typeof applicationFieldsSchema>;
export type ApplicationFieldsData = z.output<typeof applicationFieldsSchema>;
export type ApplicationRequestData = z.output<typeof applicationRequestSchema>;

const STEP_SCHEMAS = {
  1: applicationStep1Schema,
  2: applicationStep2Schema,
  3: applicationStep3Schema,
  4: applicationStep4Schema,
} as const;

export const validateApplication = (input: unknown) => validate(applicationRequestSchema, input);
export const validateApplicationFields = (input: unknown) =>
  validate(applicationFieldsSchema, input);
export const validateApplicationStep = (step: ApplicationStep, input: unknown) =>
  validate(STEP_SCHEMAS[step] as z.ZodMiniType, input);
