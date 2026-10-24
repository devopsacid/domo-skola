/** Localized email templates (ADR-0001 D5, D11). Pure functions, no I/O. */
import type { Locale } from '../../../shared/enums';
import { ADMIN, SENDER } from './dictionary';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const page = (lang: Locale, title: string, paragraphs: string[]) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>` +
  `<body>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body></html>`;

/**
 * Sender confirmation. Takes no submitted data at all: the type signature is the guard that
 * no user-typed text or child data can reach it. The brand comes from settings.
 */
export function renderSenderConfirmation(
  locale: Locale,
  kind: 'contact' | 'application',
  brand: string,
): RenderedEmail {
  const c = SENDER[locale][kind];
  return {
    subject: c.subject,
    text: `${c.greeting}\n\n${c.body}\n\n${c.footer}\n\n${brand}\n`,
    html: page(locale, c.subject, [esc(c.greeting), esc(c.body), esc(c.footer), esc(brand)]),
  };
}

export interface AdminNotificationInput {
  type: 'inquiry' | 'application';
  id: string;
  recordLocale: Locale;
  region: string;
  /** Contact subject enum (inquiries). */
  subject?: string;
  /** Intended grade (applications): a number, never a name. */
  grade?: number;
  nextStep?: string;
  suspectedSpam: boolean;
  siteUrl: string;
  brand: string;
}

/** Admin notification: enum data and a link only. Reply-To is set by the sender, not here. */
export function renderAdminNotification(
  adminLocale: Locale,
  d: AdminNotificationInput,
): RenderedEmail {
  const c = ADMIN[adminLocale];
  const l = c.labels;
  const base = d.type === 'inquiry' ? c.subjectInquiry : c.subjectApplication;
  const subject = `${d.suspectedSpam ? c.spamPrefix : ''}${base}`;
  const path = d.type === 'inquiry' ? 'inquiries' : 'applications';
  const link = `${d.siteUrl.replace(/\/+$/, '')}/admin/#/${path}/${encodeURIComponent(d.id)}`;
  const rows: [string, string][] = [
    [l.type, d.type === 'inquiry' ? l.inquiry : l.application],
    [l.language, d.recordLocale],
    [l.region, d.region],
  ];
  if (d.subject) rows.push([l.subject, d.subject]);
  if (d.grade !== undefined) rows.push([l.grade, String(d.grade)]);
  if (d.nextStep) rows.push([l.nextStep, d.nextStep]);
  if (d.suspectedSpam) rows.push([l.spam, '1']);
  const lines = rows.map(([k, v]) => `${k}: ${v}`);
  return {
    subject,
    text: `${c.intro}\n\n${lines.join('\n')}\n${l.link}: ${link}\n\n${d.brand}\n`,
    html: page(adminLocale, subject, [
      esc(c.intro),
      ...lines.map(esc),
      `${esc(l.link)}: <a href="${esc(link)}">${esc(link)}</a>`,
      esc(d.brand),
    ]),
  };
}
