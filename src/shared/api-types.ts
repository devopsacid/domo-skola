/**
 * Request and response contracts shared by islands and Functions.
 * Field sets are inferred from src/shared/schemas/.
 */
import type { ApplicationStatus, InquiryStatus, Locale, Region } from './enums';
import type { ErrorCode } from './errors';
import type { ApplicationFieldsData } from './schemas/application';
import type { ContactFieldsData } from './schemas/contact';

export interface ApiOk<T = Record<string, never>> {
  ok: true;
  data?: T;
}

/** Generic error envelope; see the specific shapes below for what each status carries. */
export interface ApiError {
  ok: false;
  error: ErrorCode;
  /** Field name -> validation error code (only with `validation`). Codes, never messages. */
  fields?: Record<string, string>;
  /** Seconds to wait (only with `rate_limited`; mirrors the Retry-After header). */
  retry_after?: number;
}

/** 400 */
export interface ApiBadRequest extends ApiError {
  error: 'bad_request';
}
/** 403 */
export interface ApiOriginError extends ApiError {
  error: 'origin';
}
/** 409, enrolment only: applications are not being accepted. */
export interface ApiClosed extends ApiError {
  error: 'closed';
}
/** 422 with a field -> code map. Field names match the `fields` keys of the request. */
export interface ApiValidationError extends ApiError {
  error: 'validation';
  fields: Record<string, string>;
}
/** 429 */
export interface ApiRateLimited extends ApiError {
  error: 'rate_limited';
}
/** 500: no detail, no stack, no field map. */
export interface ApiServerError extends ApiError {
  error: 'server';
}

export type ApiResponse<T = Record<string, never>> = ApiOk<T> | ApiError;

/** Success is `201 {ok:true}` for both forms. No record id and no submitted data is echoed back. */
export type ContactSuccess = ApiOk;
export type ApplicationSuccess = ApiOk;
export type ContactResponse =
  | ContactSuccess
  | ApiBadRequest
  | ApiOriginError
  | ApiValidationError
  | ApiRateLimited
  | ApiServerError;
export type ApplicationResponse =
  | ApplicationSuccess
  | ApiBadRequest
  | ApiOriginError
  | ApiClosed
  | ApiValidationError
  | ApiRateLimited
  | ApiServerError;

export const isApiError = (r: { ok: boolean }): r is ApiError => r.ok === false;
export const isValidationError = (r: { ok: boolean; error?: string }): r is ApiValidationError =>
  r.ok === false && r.error === 'validation';
export const isRateLimited = (r: { ok: boolean; error?: string }): r is ApiRateLimited =>
  r.ok === false && r.error === 'rate_limited';

/** Field sets are derived from the Zod schemas so the contract cannot drift. */
export type ContactFields = ContactFieldsData;
export type ApplicationFields = ApplicationFieldsData;

export interface ContactRequest {
  locale: Locale;
  fields: ContactFields;
  /** Honeypot; must be empty. */
  hp: string;
  /** Epoch ms when the form was rendered (timing heuristic). */
  renderedAt: number;
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
