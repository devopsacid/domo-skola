/**
 * Home page content (docs/ia.md §2.1): loads and types the entries the home sections
 * render. `pages.sections` is an open record in the shared schema; the home lane types
 * it here so a missing or misspelt field fails the build instead of rendering empty.
 */
import { getCollection, getEntry } from 'astro:content';
import { z } from 'astro/zod';
import type { Locale } from '../../i18n/routes';
import { status } from '../../content-schemas';

const s = z.string().min(1);
const block = { status, reviewNote: z.string().optional() };
const titled = z.object({ title: s, text: s });

export const homeSectionsSchema = z.object({
  hero: z.object({
    ...block,
    eyebrow: s,
    headline: s,
    lead: s,
    ctaPrimary: s,
    ctaSecondary: s,
    facts: z.array(s).min(1),
  }),
  philosophy: z.object({
    ...block,
    eyebrow: s,
    title: s,
    body: z.array(s).min(1),
    points: z.array(titled).min(1),
    link: s,
  }),
  pillars: z.object({
    ...block,
    eyebrow: s,
    title: s,
    intro: s,
    benefitsLabel: s,
    links: z.object({ montessori: s, respectful: s, constructivist: s, hejny: s }),
  }),
  day: z.object({ ...block, eyebrow: s, title: s, intro: s, link: s }),
  outcomes: z.object({
    ...block,
    eyebrow: s,
    title: s,
    intro: s,
    items: z.array(titled).length(8),
  }),
  examples: z.object({
    ...block,
    eyebrow: s,
    title: s,
    intro: s,
    items: z
      .array(z.object({ key: z.enum(['measurement', 'hejny']), title: s, text: s, takeaway: s }))
      .min(1),
  }),
  environment: z.object({
    ...block,
    eyebrow: s,
    title: s,
    intro: s,
    tiles: z.array(z.object({ kind: z.enum(['venue', 'materials', 'outdoor']), label: s })).min(1),
  }),
  fit: z.object({
    ...block,
    eyebrow: s,
    title: s,
    intro: s,
    items: z.array(s).min(1),
    closing: s,
    cta: s,
  }),
  regions: z.object({ ...block, eyebrow: s, title: s, intro: s, pending: s }),
  process: z.object({
    ...block,
    eyebrow: s,
    title: s,
    note: s,
    steps: z.array(titled).min(3).max(4),
    ctaPrimary: s,
    ctaSecondary: s,
  }),
  faq: z.object({ ...block, eyebrow: s, title: s, link: s, pendingLink: s }),
  finalCta: z.object({ ...block, title: s, text: s, ctaPrimary: s, ctaSecondary: s }),
});

export type HomeSections = z.infer<typeof homeSectionsSchema>;

export async function getHome(locale: Locale) {
  const entry = await getEntry('pages', `${locale}/home`);
  if (!entry) throw new Error(`pages/${locale}/home is missing`);
  const parsed = homeSectionsSchema.safeParse(entry.data.sections);
  if (!parsed.success) throw new Error(`pages/${locale}/home sections: ${parsed.error.message}`);
  return { seo: entry.data.seo, status: entry.data.status, sections: parsed.data };
}

const inLocale = (locale: Locale) => (e: { id: string }) => e.id.startsWith(`${locale}/`);

/** Draft entries never render; ordering comes from the content. */
export async function getPillars(locale: Locale) {
  const all = await getCollection('pillars', inLocale(locale));
  const list = all.filter((p) => p.data.status !== 'draft').map((p) => p.data);
  if (list.length !== 4) throw new Error(`pillars/${locale}: expected 4, found ${list.length}`);
  return list.sort((a, b) => a.order - b.order);
}

export async function getDaySchedule(locale: Locale) {
  const entry = await getEntry('daySchedule', `${locale}/example`);
  if (!entry) throw new Error(`daySchedule/${locale}/example is missing`);
  return entry.data;
}

export async function getFeaturedFaq(locale: Locale) {
  const all = await getCollection('faqItems', inLocale(locale));
  return all
    .map((e) => e.data)
    .filter((f) => f.featuredOnHome && f.status !== 'draft')
    .sort((a, b) => a.order - b.order)
    .slice(0, 6);
}

export type Pillar = Awaited<ReturnType<typeof getPillars>>[number];
export type FaqItem = Awaited<ReturnType<typeof getFeaturedFaq>>[number];

type Status = z.infer<typeof status>;
/** The least-verified status of a block and the entries it renders (draft > needs-review > verified). */
export function worstStatus(...statuses: Status[]): Status {
  if (statuses.includes('draft')) return 'draft';
  if (statuses.includes('needs-review')) return 'needs-review';
  return 'verified';
}
export type DaySchedule = Awaited<ReturnType<typeof getDaySchedule>>;
