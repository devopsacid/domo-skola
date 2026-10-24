import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  dayScheduleSchema,
  faqCategoriesSchema,
  faqItemsSchema,
  gallerySchema,
  pagesSchema,
  pillarsSchema,
  postsSchema,
  settingsSchema,
  teamSchema,
  uiSchema,
} from './content-schemas';

// Per-locale layout: src/content/<collection>/<locale>/<id>.{md,json,yaml}
const perLocale = (name: string) =>
  glob({
    pattern: '**/*.{md,mdx,json,yaml,yml}',
    base: `./src/content/${name}`,
  });

export const collections = {
  // One file, all locales; Facts carry their own status.
  settings: defineCollection({
    loader: file('src/content/settings/settings.json', {
      parser: (text) => [{ id: 'settings', ...JSON.parse(text) }],
    }),
    schema: settingsSchema,
  }),
  pages: defineCollection({ loader: perLocale('pages'), schema: pagesSchema }),
  pillars: defineCollection({
    loader: perLocale('pillars'),
    schema: pillarsSchema,
  }),
  daySchedule: defineCollection({
    loader: perLocale('daySchedule'),
    schema: dayScheduleSchema,
  }),
  faqCategories: defineCollection({
    loader: perLocale('faqCategories'),
    schema: faqCategoriesSchema,
  }),
  faqItems: defineCollection({
    loader: perLocale('faqItems'),
    schema: faqItemsSchema,
  }),
  team: defineCollection({ loader: perLocale('team'), schema: teamSchema }),
  gallery: defineCollection({
    loader: perLocale('gallery'),
    schema: gallerySchema,
  }),
  posts: defineCollection({ loader: perLocale('posts'), schema: postsSchema }),
  // src/content/ui/<locale>/<namespace>.json
  ui: defineCollection({ loader: perLocale('ui'), schema: uiSchema }),
};
