/**
 * Whether the settings facts under a path are all verified, e.g. "settings.fees"
 * or "settings.venue" (every Fact inside). Used for FAQ `dependsOnFacts`.
 * Unknown paths count as unverified, so a typo never hides a pending state.
 */
type Node = unknown;

function isFact(n: Node): n is { status: string } {
  return typeof n === 'object' && n !== null && 'status' in n && 'value' in n;
}

/** Every Fact in a subtree (non-fact leaves such as translated descriptions are ignored). */
function collectFacts(n: Node, out: { status: string }[] = []): { status: string }[] {
  if (isFact(n)) out.push(n);
  else if (typeof n === 'object' && n !== null)
    for (const v of Object.values(n)) collectFacts(v, out);
  return out;
}

function allVerified(n: Node): boolean {
  const facts = collectFacts(n);
  return facts.length > 0 && facts.every((f) => f.status === 'verified');
}

export function factsVerified(settings: Record<string, Node>, path: string): boolean {
  const parts = path.replace(/^settings\./, '').split('.');
  let node: Node = settings;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null || !(p in node)) return false;
    node = (node as Record<string, Node>)[p];
  }
  return allVerified(node);
}

export type FactUnit = 'days';

const DAYS: Record<string, (n: number) => string> = {
  sk: (n) => `${n} ${n === 1 ? 'deň' : n >= 2 && n <= 4 ? 'dni' : 'dní'}`,
  cs: (n) => `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`,
  en: (n) => `${n} ${n === 1 ? 'day' : 'days'}`,
};

function nodeAt(settings: Record<string, Node>, path: string): Node {
  let node: Node = settings;
  for (const p of path.replace(/^settings\./, '').split('.')) {
    if (typeof node !== 'object' || node === null || !(p in node)) return undefined;
    node = (node as Record<string, Node>)[p];
  }
  return node;
}

const isI18n = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && 'sk' in v && 'en' in v;

/**
 * The display text of one settings Fact, or null while it is not verified (or empty):
 * the caller then renders the pending state. Never returns an unverified value.
 * Handles translated strings ({sk, cs, en}), the fees shape ({visible, text}),
 * string lists, numbers (with an optional unit) and plain strings.
 */
export function factText(
  settings: Record<string, Node>,
  path: string,
  locale: string,
  opts: { unit?: FactUnit; names?: Record<string, string> } = {},
): string | null {
  const node = nodeAt(settings, path);
  if (!isFact(node) || node.status !== 'verified') return null;
  const value = (node as { status: string; value?: unknown }).value;
  let text: string | null = null;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number')
    text = opts.unit === 'days' ? (DAYS[locale] ?? DAYS.en)(value) : String(value);
  else if (Array.isArray(value))
    text = value.map((v) => opts.names?.[String(v)] ?? String(v)).join(', ');
  else if (isI18n(value)) text = value[locale] ?? null;
  else if (typeof value === 'object' && value !== null && 'text' in value) {
    const fee = value as { visible?: boolean; text?: unknown };
    text = fee.visible && isI18n(fee.text) ? (fee.text[locale] ?? null) : null;
  }
  return text && text.trim() ? text : null;
}
