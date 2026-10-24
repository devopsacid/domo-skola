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
