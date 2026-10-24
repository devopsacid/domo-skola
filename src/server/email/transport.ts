/**
 * Email transport interface (ADR-0001 D5). Adapters call an HTTP API with fetch (no SMTP from Workers).
 * A failed send reports a short provider code only: provider messages can echo the recipient address.
 */
import { createBrevoTransport } from './brevo';
import { createMockTransport } from './mock';

export interface EmailMessage {
  to: string;
  /** `Name <address>` or a bare address. */
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  tag: string;
}
export type SendResult = { ok: true; messageId?: string } | { ok: false; code: string };
export interface EmailTransport {
  send(message: EmailMessage): Promise<SendResult>;
}

export interface TransportConfig {
  provider: 'brevo' | 'mock';
  apiKey?: string;
  apiBase?: string;
}

export function createTransport(cfg: TransportConfig, fetchFn: typeof fetch): EmailTransport {
  if (cfg.provider === 'brevo') {
    if (!cfg.apiKey) throw new Error('email transport is not configured');
    return createBrevoTransport({ apiKey: cfg.apiKey, apiBase: cfg.apiBase, fetch: fetchFn });
  }
  if (!cfg.apiBase) throw new Error('email transport is not configured');
  return createMockTransport({ apiBase: cfg.apiBase, fetch: fetchFn });
}

/** `Name <a@b>` -> parts. */
export function parseAddress(value: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
  if (!m) return { email: value.trim() };
  const name = (m[1] ?? '').replace(/^"|"$/g, '');
  return name ? { email: (m[2] ?? '').trim(), name } : { email: (m[2] ?? '').trim() };
}

const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/;

/** Shared failure mapping for HTTP adapters. */
export async function failureCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { code?: unknown };
    if (typeof body.code === 'string' && SAFE_CODE.test(body.code)) return body.code;
  } catch {
    /* not JSON */
  }
  return `http_${res.status}`;
}

export function errorCode(err: unknown): string {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    ? 'timeout'
    : 'network_error';
}
