/**
 * Publishing rules for blog posts (docs/ia.md §2.8, brief §9). Pure functions, so the
 * rules are unit-tested without the content store.
 * - `draft` never renders (the 8 §9 article concepts are draft outlines).
 * - `needs-review` renders only in preview builds, with the review badge.
 * - `verified` renders everywhere.
 * - A post with `legalReviewRequired` never renders before `legalReviewedAt` is set,
 *   in any build: legal explanations must be checked against current Slovak rules first.
 */
import type { Locale } from '../../i18n/routes';

export interface PostLike {
  translationKey: string;
  slug: string;
  status: 'draft' | 'needs-review' | 'verified';
  legalReviewRequired: boolean;
  legalReviewedAt?: Date;
  publishedAt?: Date;
  cluster: string;
}

export function isRenderable(post: PostLike, strict: boolean): boolean {
  if (post.legalReviewRequired && !post.legalReviewedAt) return false;
  if (post.status === 'verified') return true;
  return post.status === 'needs-review' && !strict;
}

/** Newest first; undated posts last, then by slug for a stable order. */
export function byDate(a: PostLike, b: PostLike): number {
  const ta = a.publishedAt?.getTime() ?? -Infinity;
  const tb = b.publishedAt?.getTime() ?? -Infinity;
  return tb - ta || a.slug.localeCompare(b.slug);
}

/** translationKey -> locale -> slug, over renderable posts only (no hreflang to a hidden post). */
export function translationMap(
  posts: { locale: Locale; post: PostLike }[],
): Map<string, Partial<Record<Locale, string>>> {
  const map = new Map<string, Partial<Record<Locale, string>>>();
  for (const { locale, post } of posts) {
    const entry = map.get(post.translationKey) ?? {};
    entry[locale] = post.slug;
    map.set(post.translationKey, entry);
  }
  return map;
}

/** Up to `max` other posts, same cluster first, then the newest of the rest. */
export function related<T extends PostLike>(post: T, all: T[], max = 3): T[] {
  const others = all.filter((p) => p.slug !== post.slug).sort(byDate);
  const same = others.filter((p) => p.cluster === post.cluster);
  const rest = others.filter((p) => p.cluster !== post.cluster);
  return [...same, ...rest].slice(0, max);
}
