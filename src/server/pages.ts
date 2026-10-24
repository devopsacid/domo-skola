/**
 * The only Cloudflare Pages Functions specifics: the context shape and its adapter.
 * Moving to Workers replaces `functions/` with a router that builds the same HandlerContext.
 */
import type { Env, HandlerContext } from './env';

export interface PagesContext {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
  data: Record<string, unknown>;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}
export type PagesHandler = (context: PagesContext) => Response | Promise<Response>;

export function handlerContext(c: PagesContext): HandlerContext {
  const id = c.data.requestId;
  return {
    requestId: typeof id === 'string' ? id : crypto.randomUUID(),
    waitUntil: (p) => c.waitUntil(p),
  };
}
