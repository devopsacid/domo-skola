/**
 * Email delivery after the database commit (ADR-0001 D5). Each send updates its `email_deliveries`
 * row; `last_error_code` only ever holds a short provider code, never a message.
 */
import type { Config } from '../config';
import { markDelivery } from '../db/submissions';
import type { D1Like } from '../db/types';
import type { Deps } from '../deps';
import type { Locale } from '../../shared/enums';
import { logError } from '../log';
import { createTransport, type EmailMessage, type EmailTransport } from './transport';
import { renderAdminNotification, renderSenderConfirmation } from './templates';

export interface EmailSubject {
  type: 'inquiry' | 'application';
  id: string;
  /** Submitter address (recipient of the confirmation, Reply-To of the notification). */
  email: string;
  recordLocale: Locale;
  /** contact: the page locale; application: preferred_language (docs/architecture.md section 4.2). */
  confirmationLocale: Locale;
  region: string;
  subject?: string | undefined;
  grade?: number | undefined;
  nextStep?: string | undefined;
  suspectedSpam: boolean;
}

export interface ComposedEmails {
  confirmation: EmailMessage | null;
  admin: EmailMessage | null;
}

/** null means "not configured" (missing from-address or notify address). */
export function composeEmails(cfg: Config, deps: Deps, s: EmailSubject): ComposedEmails {
  const from = cfg.email.from;
  const brand = deps.settings.brand;
  let confirmation: EmailMessage | null = null;
  let admin: EmailMessage | null = null;
  if (from) {
    const c = renderSenderConfirmation(
      s.confirmationLocale,
      s.type === 'inquiry' ? 'contact' : 'application',
      brand,
    );
    confirmation = {
      to: s.email,
      from,
      replyTo: cfg.email.replyTo,
      tag: 'sender_confirmation',
      ...c,
    };
    if (cfg.email.adminNotifyTo) {
      const a = renderAdminNotification(cfg.adminEmailLocale, {
        type: s.type,
        id: s.id,
        recordLocale: s.recordLocale,
        region: s.region,
        subject: s.subject,
        grade: s.grade,
        nextStep: s.nextStep,
        suspectedSpam: s.suspectedSpam,
        siteUrl: cfg.siteUrl,
        brand,
      });
      admin = {
        to: cfg.email.adminNotifyTo,
        from,
        replyTo: s.suspectedSpam ? undefined : s.email,
        tag: 'admin_notification',
        ...a,
      };
    }
  }
  return { confirmation, admin };
}

export function buildTransport(cfg: Config, deps: Deps): EmailTransport | null {
  if (deps.transport) return deps.transport;
  try {
    return createTransport(cfg.email, deps.fetch);
  } catch {
    return null;
  }
}

/** Sends one message and records the outcome. Never throws. */
export async function sendAndRecord(
  db: D1Like,
  transport: EmailTransport | null,
  deliveryId: string,
  message: EmailMessage | null,
  now: () => Date,
  requestId: string,
): Promise<{ status: 'sent' | 'failed'; code: string | null }> {
  let result: { ok: true; messageId?: string | undefined } | { ok: false; code: string };
  if (!transport || !message) result = { ok: false, code: 'not_configured' };
  else {
    try {
      result = await transport.send(message);
    } catch (err) {
      logError(requestId, 'email', err);
      result = { ok: false, code: 'transport_error' };
    }
  }
  try {
    await markDelivery(db, deliveryId, result, now().toISOString()).run();
  } catch (err) {
    logError(requestId, 'email', err);
  }
  return result.ok ? { status: 'sent', code: null } : { status: 'failed', code: result.code };
}
