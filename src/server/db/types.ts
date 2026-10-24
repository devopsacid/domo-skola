/**
 * Minimal structural types for the D1 binding, so server code and its tests need no
 * Workers type package. The real D1Database satisfies these interfaces.
 */
export interface D1ResultLike<T = unknown> {
  results?: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number; [k: string]: unknown };
}
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1ResultLike>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}
export interface D1Like {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<D1ResultLike[]>;
}

/** D1 rejects `undefined` binds; every bind goes through here so undefined is stored as NULL. */
export function stmt(db: D1Like, sql: string, ...values: unknown[]): D1StatementLike {
  return db.prepare(sql).bind(...values.map((v) => (v === undefined ? null : v)));
}
