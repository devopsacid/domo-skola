/** Brevo (EU) transactional email over HTTPS: POST /v3/smtp/email. */
import {
  errorCode,
  failureCode,
  parseAddress,
  type EmailMessage,
  type EmailTransport,
  type SendResult,
} from './transport';

const DEFAULT_BASE = 'https://api.brevo.com';
const TIMEOUT_MS = 8000;

export function createBrevoTransport(opts: {
  apiKey: string;
  apiBase?: string;
  fetch: typeof fetch;
}): EmailTransport {
  const base = (opts.apiBase ?? DEFAULT_BASE).replace(/\/+$/, '');
  return {
    async send(m: EmailMessage): Promise<SendResult> {
      const payload = {
        sender: parseAddress(m.from),
        to: [{ email: m.to }],
        ...(m.replyTo ? { replyTo: parseAddress(m.replyTo) } : {}),
        subject: m.subject,
        textContent: m.text,
        htmlContent: m.html,
        tags: [m.tag],
      };
      try {
        const res = await opts.fetch(`${base}/v3/smtp/email`, {
          method: 'POST',
          headers: { 'api-key': opts.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return { ok: false, code: await failureCode(res) };
        const body = (await res.json().catch(() => ({}))) as { messageId?: unknown };
        const id = typeof body.messageId === 'string' ? body.messageId.slice(0, 128) : undefined;
        return id ? { ok: true, messageId: id } : { ok: true };
      } catch (err) {
        return { ok: false, code: errorCode(err) };
      }
    },
  };
}
