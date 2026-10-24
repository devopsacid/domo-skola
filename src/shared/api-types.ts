/**
 * Request and response contracts shared by islands and Functions.
 * Zod schemas for the field sets arrive with the forms lane (src/shared/schemas/).
 */
import type { ApplicationStatus, ContactSubject, Grade, InquiryStatus, Locale, Region } from './enums';
import type { ErrorCode } from './errors';

export interface ApiOk<T = Record<string, never>> {
  ok: true;
  data?: T;
}

export interface ApiError {
  ok: false;
  error: ErrorCode;
  /** Field path -> validation error code (only with `validation`). */
  fields?: Record<string, string>;
}

export type ApiResponse<T = Record<string, never>> = ApiOk<T> | ApiError;

export interface ContactFields {
  parent_name: string;
  email: string;
  phone?: string;
  region: Region;
  subject: ContactSubject;
  message: string;
  privacy_ack: boolean;
  marketing_consent?: boolean;
}

export interface ContactRequest {
  locale: Locale;
  fields: ContactFields;
  /** Honeypot; must be empty. */
  hp: string;
  /** Epoch ms when the form was rendered (timing heuristic). */
  renderedAt: number;
}

export interface ApplicationFields {
  parent_name: string;
  email: string;
  phone: string;
  municipality: string;
  region: Region;
  preferred_language: Locale;
  child_name: string;
  intended_grade: Grade;
  intended_school_year: string;
  current_arrangement?: string;
  motivation?: string;
  environment_priorities?: string;
  questions?: string;
  preferred_next_step: 'call' | 'visit' | 'info';
  privacy_ack: boolean;
  marketing_consent?: boolean;
}

export interface ApplicationRequest {
  locale: Locale;
  fields: ApplicationFields;
  hp: string;
  renderedAt: number;
}

export interface AdminMe {
  email: string;
  role: 'admin' | 'coordinator';
}

export interface RecordSummary {
  id: string;
  type: 'inquiry' | 'application';
  created_at: string;
  status: InquiryStatus | ApplicationStatus;
  region: Region;
  suspected_spam: boolean;
}
