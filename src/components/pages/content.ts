/**
 * Content pages (docs/ia.md §2.2–§2.9): loads and types `pages/<locale>/<key>` for the
 * L4 pages. `pages.sections` is an open record in the shared schema; each page is typed
 * here so a missing or misspelt field fails the build instead of rendering empty.
 *
 * Most practical and legal text uses one reusable shape, the topic group: a heading, an
 * intro and topics. A topic can show settings facts (`facts`, verified values only, the
 * pending text otherwise), a `pendingNote` that renders only while `dependsOnFacts` are
 * unverified, and a link to another page.
 */
import { getCollection, getEntry } from 'astro:content';
import { z } from 'astro/zod';
import type { Locale } from '../../i18n/routes';
import { FAQ_CATEGORY_KEYS, POST_CLUSTERS, status } from '../../content-schemas';
import { getSettings } from '../site/settings';

export { getSettings };

const s = z.string().min(1);
const block = { status, reviewNote: z.string().optional() };

/** Page keys a content link may point at (not `post`, which needs a slug). */
export const LINK_KEYS = [
  'home',
  'approach',
  'day',
  'parents',
  'enrol',
  'contact',
  'faq',
  'blog',
  'privacy',
  'cookies',
  'legal',
] as const;

export const linkSchema = z.object({
  to: z.enum(LINK_KEYS),
  label: s,
  /** In-page anchor on the target page, without '#'. */
  hash: z.string().optional(),
  /** Query string without '?', e.g. "subject=visit". */
  query: z.string().optional(),
});

export const factRowSchema = z.object({
  label: s,
  /** Settings path of a Fact, e.g. "settings.operations.meals". */
  path: s,
  unit: z.enum(['days']).optional(),
  /** Text while the fact is not verified; defaults to the generic pending label. */
  pending: z.string().optional(),
});

/** Build-time conditions a topic may depend on (rendered only when true). */
export const CONDITIONS = ['marketingEnabled', 'analyticsOn', 'analyticsOff'] as const;

export const topicSchema = z.object({
  id: s,
  title: s,
  body: z.array(s).default([]),
  list: z.array(s).default([]),
  facts: z.array(factRowSchema).default([]),
  pendingNote: z.string().optional(),
  dependsOnFacts: z.array(s).default([]),
  link: linkSchema.optional(),
  if: z.enum(CONDITIONS).optional(),
  /** A settings list rendered with the topic (verified entries only). */
  show: z.enum(['processors']).optional(),
});

export const groupSchema = z.object({
  ...block,
  id: s,
  eyebrow: z.string().optional(),
  title: s,
  intro: z.array(s).default([]),
  items: z.array(topicSchema).min(1),
});

const intro = z.object({ ...block, eyebrow: s, title: s, lead: s });
const cta = z.object({ ...block, title: s, text: s, ctaPrimary: s, ctaSecondary: s });
const heading = { eyebrow: s, title: s, intro: s };

export const approachSchema = z.object({
  intro,
  /** How the community works day to day: small groups, guide, environment, outdoors, parents. */
  howWeWork: groupSchema,
  pillarLabels: z.object({
    ...block,
    whatItMeans: s,
    inPractice: s,
    examples: s,
    benefits: s,
    parentsCanExpect: s,
  }),
  topics: groupSchema,
  complement: z.object({
    ...block,
    id: s,
    eyebrow: s,
    title: s,
    body: z.array(s).min(1),
    items: z
      .array(
        z.object({
          key: z.enum(['montessori', 'respectful', 'constructivist', 'hejny']),
          role: s,
          text: s,
        }),
      )
      .length(4),
    caveat: s,
  }),
  /** What the community does not claim (brief §2, §3): no school status, accreditation or promises. */
  notClaimed: groupSchema,
  cta,
});

export const DAY_ASPECTS = [
  'rhythm',
  'independent_guided',
  'outdoor',
  'creative',
  'rest',
  'social',
  'math_language',
  'reflection',
] as const;

export const daySchema = z.object({
  intro,
  rhythm: z.object({ ...block, ...heading }),
  aspects: z.object({
    ...block,
    ...heading,
    items: z.array(z.object({ kind: z.enum(DAY_ASPECTS), title: s, text: s })).length(8),
  }),
  /** Who is with the children and how: the guide, small groups, weather, arrival and pick-up. */
  people: groupSchema,
  practical: groupSchema,
  cta,
});

export const LEGAL_FORMS = ['registered_school', 'community_group', 'individual_education'] as const;

export const legalStatusSchema = z.object({
  ...block,
  id: s,
  eyebrow: s,
  title: s,
  intro: z.array(s).min(1),
  formsTitle: s,
  forms: z
    .array(z.object({ key: z.enum(LEGAL_FORMS), title: s, text: s, points: z.array(s).default([]) }))
    .length(3),
  formsNote: s,
  ourModelTitle: s,
  ourModelPending: s,
  partnersTitle: s,
  responsibilitiesTitle: s,
  responsibilitiesPending: s,
  contactLink: s,
});

export const parentsSchema = z.object({
  intro,
  basics: groupSchema,
  learning: groupSchema,
  family: groupSchema,
  practical: groupSchema,
  admission: z.object({
    ...block,
    id: s,
    eyebrow: s,
    title: s,
    intro: s,
    note: s,
    ctaPrimary: s,
    ctaSecondary: s,
  }),
  /** How enrolment and formal home education work in general terms (legal review). */
  formal: groupSchema,
  legal: legalStatusSchema,
  cta,
});

export const faqPageSchema = z.object({
  intro,
  search: z.object({
    ...block,
    label: s,
    hint: s,
    /** "{n}" is replaced by the number of matches. */
    results: s,
    noneTitle: s,
    noneText: s,
    ctaContact: s,
    ctaMeet: s,
    categoriesLabel: s,
    pendingLink: s,
  }),
  cta,
});

export const blogSchema = z.object({
  intro,
  empty: z.object({ ...block, title: s, text: s, links: z.array(linkSchema).min(1) }),
  taxonomy: z.object({
    ...block,
    label: s,
    clusters: z.object(
      Object.fromEntries(POST_CLUSTERS.map((c) => [c, s])) as Record<
        (typeof POST_CLUSTERS)[number],
        typeof s
      >,
    ),
  }),
  post: z.object({
    ...block,
    published: s,
    updated: s,
    editorial: s,
    related: s,
    back: s,
  }),
  cta,
});

/** Privacy, cookies, legal: `intro`, then any number of topic groups in content order. */
export const legalDocSchema = z
  .object({ intro: intro.extend({ draftNote: s }) })
  .catchall(groupSchema)
  .transform(({ intro, ...rest }) => ({ intro, groups: Object.values(rest) as z.infer<typeof groupSchema>[] }))
  .refine((d) => d.groups.length > 0, 'at least one topic group');

export const PAGE_SCHEMAS = {
  approach: approachSchema,
  day: daySchema,
  parents: parentsSchema,
  faq: faqPageSchema,
  blog: blogSchema,
  privacy: legalDocSchema,
  cookies: legalDocSchema,
  legal: legalDocSchema,
} as const;
export type ContentPageKey = keyof typeof PAGE_SCHEMAS;
export type PageSections<K extends ContentPageKey> = z.infer<(typeof PAGE_SCHEMAS)[K]>;
export type Group = z.infer<typeof groupSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type ContentLink = z.infer<typeof linkSchema>;

export async function getPage<K extends ContentPageKey>(key: K, locale: Locale) {
  const entry = await getEntry('pages', `${locale}/${key}`);
  if (!entry) throw new Error(`pages/${locale}/${key} is missing`);
  const parsed = PAGE_SCHEMAS[key].safeParse(entry.data.sections);
  if (!parsed.success) throw new Error(`pages/${locale}/${key} sections: ${parsed.error.message}`);
  return {
    seo: entry.data.seo,
    status: entry.data.status,
    sections: parsed.data as PageSections<K>,
  };
}

const inLocale = (locale: Locale) => (e: { id: string }) => e.id.startsWith(`${locale}/`);

/** FAQ categories in content order; drafts never render. All 8 must exist. */
export async function getFaqCategories(locale: Locale) {
  const all = await getCollection('faqCategories', inLocale(locale));
  const list = all.map((e) => e.data).filter((c) => c.status !== 'draft');
  if (list.length !== FAQ_CATEGORY_KEYS.length)
    throw new Error(`faqCategories/${locale}: expected ${FAQ_CATEGORY_KEYS.length}, found ${list.length}`);
  return list.sort((a, b) => a.order - b.order);
}

export async function getFaqItems(locale: Locale) {
  const all = await getCollection('faqItems', inLocale(locale));
  return all
    .map((e) => e.data)
    .filter((f) => f.status !== 'draft')
    .sort((a, b) => a.order - b.order);
}

export type FaqCategory = Awaited<ReturnType<typeof getFaqCategories>>[number];
export type FaqEntry = Awaited<ReturnType<typeof getFaqItems>>[number];
