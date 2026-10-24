/** Contact form (brief section 6). One schema shared by the island and /api/contact. */
import * as z from 'zod/mini';
import { CONTACT_SUBJECTS, REGIONS } from '../enums';
import {
  LIMITS,
  consentVersionField,
  consentVersionRule,
  emailField,
  enumField,
  envelope,
  nameField,
  optionalTickField,
  phoneField,
  textField,
  tickField,
  validate,
} from './common';

export const contactFieldsSchema = z
  .object({
    parent_name: nameField(LIMITS.parent_name),
    email: emailField(),
    phone: phoneField({ required: false }),
    region: enumField(REGIONS),
    subject: enumField(CONTACT_SUBJECTS),
    message: textField(LIMITS.message, { required: true }),
    privacy_ack: tickField('privacy_ack_required'),
    marketing_consent: optionalTickField(),
    marketing_consent_text_version: consentVersionField(),
  })
  .check(consentVersionRule());

export const contactRequestSchema = envelope(contactFieldsSchema);

export type ContactFieldsInput = z.input<typeof contactFieldsSchema>;
export type ContactFieldsData = z.output<typeof contactFieldsSchema>;
export type ContactRequestData = z.output<typeof contactRequestSchema>;

export const validateContact = (input: unknown) => validate(contactRequestSchema, input);
export const validateContactFields = (input: unknown) => validate(contactFieldsSchema, input);
