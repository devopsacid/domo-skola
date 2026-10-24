/** Blog posts for the index and post routes (rules in ./rules.ts). */
import { getCollection, type CollectionEntry } from 'astro:content';
import { LOCALES, type Locale } from '../../i18n/routes';
import { isStrictBuild } from '../status/mode';
import { byDate, isRenderable, translationMap } from './rules';

export type PostEntry = CollectionEntry<'posts'>;

/**
 * The locale folder of a post. Not the entry id: the glob loader uses a `slug` field as
 * the id when present, so ids are bare slugs; the file path keeps the locale folder.
 */
export const localeOf = (filePath: string | undefined): Locale | undefined =>
  filePath?.match(/(?:^|\/)posts\/([a-z]{2})\//)?.[1] as Locale | undefined;

/** Every renderable post in every locale. */
export async function getRenderablePosts(): Promise<{ locale: Locale; entry: PostEntry }[]> {
  const strict = isStrictBuild();
  const all = await getCollection('posts', (e) => isRenderable(e.data, strict));
  return all
    .map((entry) => ({ locale: localeOf(entry.filePath), entry }))
    .filter((p): p is { locale: Locale; entry: PostEntry } =>
      (LOCALES as readonly string[]).includes(p.locale ?? ''),
    )
    .sort((a, b) => byDate(a.entry.data, b.entry.data));
}

export async function getPostTranslations() {
  const all = await getRenderablePosts();
  return translationMap(all.map((p) => ({ locale: p.locale, post: p.entry.data })));
}
