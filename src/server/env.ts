import type { D1Like } from './db/types';

/** Raw Pages Functions environment: bindings, vars and secrets. Everything is optional text until parsed. */
export interface Env {
  DB: D1Like;
  [name: string]: unknown;
}

/** Context passed from the thin Function wrappers to the plain handlers. */
export interface HandlerContext {
  waitUntil(promise: Promise<unknown>): void;
  requestId: string;
}
