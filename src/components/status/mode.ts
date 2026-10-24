/**
 * How a block with a content status renders (docs/ia.md §4 "Rendering rules").
 * - verified: plain.
 * - preview builds (CONTENT_STRICT unset): draft and needs-review render with a
 *   visible review marker.
 * - launch builds (CONTENT_STRICT=1): draft is left out; needs-review fails the build.
 */
import type { ContentStatus } from '../../shared/enums';

export type { ContentStatus };
export type RenderMode = 'plain' | 'marked' | 'hidden';

export function isStrictBuild(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONTENT_STRICT === '1';
}

export function renderMode(status: ContentStatus, strict: boolean, what = 'content'): RenderMode {
  if (status === 'verified') return 'plain';
  if (!strict) return 'marked';
  if (status === 'draft') return 'hidden';
  throw new Error(`CONTENT_STRICT=1: needs-review ${what} would be rendered`);
}

/** Editorial placeholders and preview-only markers render only outside strict builds. */
export function showPreviewMarkers(strict: boolean): boolean {
  return !strict;
}
