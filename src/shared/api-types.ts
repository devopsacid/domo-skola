/**
 * Request and response contracts shared by islands and Functions.
 * Field sets are inferred from src/shared/schemas/.
 */
import type { ApplicationStatus, InquiryStatus, Locale, Region } from './enums';
import type { FieldErrorCode } from './schemas/common';
import type { ApplicationFieldsData } from './schemas/application';
import type { ContactFieldsData } from './schemas/contact';

export interface ApiOk<T = Record<string, never>> {
  ok: true;
  data?: T;
}

/** 400 */
export interface ApiBadRequest {
  ok: false;
  error: 'bad_request';
}
/** 403 */
export interface ApiOriginError {
  ok: false;
  error: 'origin';
}
/** 409, enrolment only: applications are not being accepted. */
export interface ApiClosed {
  ok: false;
  error: 'closed';
}
/** 422 with a field -> code map. Field names match the `fields` keys of the request. Codes, never messages. */
export interface ApiValidationError {
  ok: false;
  error: 'validation';
  fields: Record<string, FieldErrorCode>;
}
/** 429; `retry_after` (seconds) mirrors the Retry-After header. */
export interface ApiRateLimited {
  ok: false;
  error: 'rate_limited';
  retry_after?: number;
}
/** 500: no detail, no stack, no field map. */
export interface ApiServerError {
  ok: false;
  error: 'server';
}

/** Every error body, discriminated by `error` (and by `ok: false`). */
export type ApiError =
  ApiBadRequest | ApiOriginError | ApiClosed | ApiValidationError | ApiRateLimited | ApiServerError;

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

export const isApiError = <T>(r: ApiResponse<T>): r is ApiError => r.ok === false;
export const isValidationError = <T>(r: ApiResponse<T>): r is ApiValidationError =>
  r.ok === false && r.error === 'validation';
export const isRateLimited = <T>(r: ApiResponse<T>): r is ApiRateLimited =>
  r.ok === false && r.error === 'rate_limited';

/** Field sets are derived from the Zod schemas so the contract cannot drift. */
export type ContactFields = ContactFieldsData;
export type ApplicationFields = ApplicationFieldsData;

export interface ContactRequest {
  locale: Locale;
  fields: ContactFields;
  /** Honeypot; must be empty. */
  hp: string;
  /** Ms from mount to submit, from performance.now() (timing heuristic; ADR-0001 D6 item 5). */
  elapsedMs: number;
}

export interface ApplicationRequest {
  locale: Locale;
  fields: ApplicationFields;
  hp: string;
  elapsedMs: number;
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
