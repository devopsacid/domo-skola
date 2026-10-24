/**
 * Brand name rendering rule. The name always comes from settings.brandName; like any
 * fact it is rendered as confirmed only when verified. Preview builds show it with
 * any status; launch builds (CONTENT_STRICT=1) throw unless it is verified.
 * Kept free of astro:content so it is unit-testable.
 */
import { renderMode, type ContentStatus } from '../status/mode';

export function brandNameFor(
  fact: { value: string | null; status: ContentStatus | string },
  strict: boolean,
): string {
  if (!fact.value) throw new Error('settings.brandName.value is empty');
  const mode = renderMode(fact.status as ContentStatus, strict, 'settings.brandName');
  if (mode === 'hidden')
    throw new Error('CONTENT_STRICT=1: draft settings.brandName cannot be rendered');
  return fact.value;
}
