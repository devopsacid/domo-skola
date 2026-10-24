/** API error codes and their HTTP status (docs/architecture.md section 4.1). */
export const ERROR_STATUS = {
  bad_request: 400,
  origin: 403,
  closed: 409,
  validation: 422,
  rate_limited: 429,
  server: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_STATUS;
}
