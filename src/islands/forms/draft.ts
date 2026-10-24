/**
 * Enrolment draft in sessionStorage (architecture §4.2). Never persistent browser storage. Consents are never stored:
 * they must be given again at the moment of sending. Every access is guarded: storage can be blocked.
 */
export const DRAFT_KEY = 'domo.enrol.draft.v1';

const FIELDS = [
  'parent_name',
  'email',
  'phone',
  'municipality',
  'region',
  'preferred_language',
  'child_name',
  'intended_grade',
  'intended_school_year',
  'current_arrangement',
  'motivation',
  'environment_priorities',
  'questions',
  'preferred_next_step',
] as const;

export interface Draft {
  step: number;
  values: Record<string, string>;
}

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(
  draft: { step: number; values: Record<string, string | boolean> },
  storage: Storage | null = store(),
): void {
  try {
    if (!storage) return;
    const values: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = draft.values[f];
      if (typeof v === 'string' && v !== '') values[f] = v;
    }
    storage.setItem(DRAFT_KEY, JSON.stringify({ step: draft.step, values }));
  } catch {
    /* quota or blocked: the draft is a convenience */
  }
}

export function loadDraft(storage: Storage | null = store()): Draft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as { step?: unknown; values?: unknown };
    const values: Record<string, string> = {};
    if (typeof p.values === 'object' && p.values !== null) {
      for (const f of FIELDS) {
        const v = (p.values as Record<string, unknown>)[f];
        if (typeof v === 'string' && v !== '') values[f] = v;
      }
    }
    const step = typeof p.step === 'number' && p.step >= 1 && p.step <= 4 ? Math.floor(p.step) : 1;
    return { step, values };
  } catch {
    return null;
  }
}

export function clearDraft(storage: Storage | null = store()): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
