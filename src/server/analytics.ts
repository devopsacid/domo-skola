/**
 * /api/e event validation (ADR-0001 D12, docs/ia.md section 3): a fixed event enum with enum-only
 * properties. No free text, no ids, no query strings.
 */
import { CONTACT_SUBJECTS } from '../shared/enums';

type PropRules = Record<string, readonly (string | number)[]>;

export const EVENTS: Record<string, PropRules> = {
  page_view: {},
  cta_click: {
    cta: ['enrol', 'approach', 'visit', 'contact'],
    location: ['header', 'hero', 'pillar', 'process', 'final', 'footer', 'inline'],
  },
  enroll_start: {},
  enroll_step: { step: [1, 2, 3, 4] },
  enroll_submit: {},
  contact_submit: { subject: CONTACT_SUBJECTS },
  visit_request: {},
  info_request: {},
  faq_search: {},
};

export interface AnalyticsEvent {
  name: string;
  props?: Record<string, string | number>;
  path: string;
}
export type ParsedEvent = { ok: true; event: AnalyticsEvent } | { ok: false };

const PATH = /^\/[a-z0-9\-/._]{0,198}$/;

export function parseAnalyticsEvent(body: unknown): ParsedEvent {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false };
  const b = body as Record<string, unknown>;
  const { name, props, path } = b;
  if (typeof name !== 'string' || !Object.hasOwn(EVENTS, name)) return { ok: false };
  if (typeof path !== 'string' || !PATH.test(path) || path.includes('..')) return { ok: false };
  const rules = EVENTS[name] as PropRules;
  if (props === undefined) return { ok: true, event: { name, path } };
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return { ok: false };
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) {
    const allowed = Object.hasOwn(rules, k) ? rules[k] : undefined;
    if (!allowed || (typeof v !== 'string' && typeof v !== 'number') || !allowed.includes(v)) {
      return { ok: false };
    }
    out[k] = v;
  }
  return { ok: true, event: Object.keys(out).length ? { name, props: out, path } : { name, path } };
}
