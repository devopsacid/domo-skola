/** Development and e2e adapter: posts the message to tools/mock-mail. Refused in production by config. */
import {
  errorCode,
  failureCode,
  type EmailMessage,
  type EmailTransport,
  type SendResult,
} from './transport';

export function createMockTransport(opts: {
  apiBase: string;
  fetch: typeof fetch;
}): EmailTransport {
  const base = opts.apiBase.replace(/\/+$/, '');
  return {
    async send(m: EmailMessage): Promise<SendResult> {
      try {
        const res = await opts.fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(m),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { ok: false, code: await failureCode(res) };
        const body = (await res.json().catch(() => ({}))) as { id?: unknown };
        return typeof body.id === 'string' ? { ok: true, messageId: body.id } : { ok: true };
      } catch (err) {
        return { ok: false, code: errorCode(err) };
      }
    },
  };
}
