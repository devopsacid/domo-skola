/**
 * Content model schemas (docs/ia.md section 4). Kept apart from content.config.ts so
 * unit tests can import them without the Astro content runtime.
 * Translatable fields are written `i18n(...)`: an object with sk, cs and en.
 * Collections are stored per locale (src/content/<collection>/<locale>/<id>.md),
 * so translatable fields there are plain strings; only settings and ui carry all locales in one file.
 */
import { z } from 'astro/zod';
import { CONTENT_STATUSES, ENROLLMENT_AVAILABILITY } from './shared/enums';

export const status = z.enum(CONTENT_STATUSES);
export const locale = z.enum(['sk', 'cs', 'en']);

/** Internal review note, never rendered. */
const reviewNote = z.string().optional();

export const i18nString = z.object({
  sk: z.string().default(''),
  cs: z.string().default(''),
  en: z.string().default(''),
});

/** Fact<T>: an assertion about the organisation. Shown as confirmed only when status = verified. */
export function fact<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable().default(null),
    status: status.default('draft'),
    reviewNote,
  });
}

/** The value of a fact only when verified; otherwise null (render "pending confirmation"). */
export function verifiedValue<T>(f: { value: T | null; status: string } | null | undefined): T | null {
  return f && f.status === 'verified' ? f.value : null;
}

const entry = { status: status.default('draft'), reviewNote };
const image = z.string().optional();

export const settingsSchema = z.object({
  brandName: fact(z.string()),
  contact: z.object({ email: fact(z.string()), phone: fact(z.string()) }),
  venue: z.object({
    name: fact(i18nString),
    address: fact(z.string()),
    municipality: fact(z.string()),
    mapImage: fact(z.string()),
    mapUrl: fact(z.string()),
    commuteNotes: fact(i18nString),
  }),
  regions: z.array(z.object({ key: z.string(), label: i18nString })),
  schoolYear: z.object({
    current: fact(z.string()),
    applicationYears: fact(z.array(z.string())),
  }),
  enrollment: z.object({
    availability: fact(z.enum(ENROLLMENT_AVAILABILITY)),
    note: i18nString.optional(),
  }),
  fees: fact(z.object({ visible: z.boolean().default(false), text: i18nString })),
  legalModel: z.object({
    type: fact(
      z.enum([
        'unknown',
        'registered_school',
        'community_group',
        'individual_education_support',
        'other',
      ]),
    ),
    description: i18nString.optional(),
    partnerSchools: z
      .array(z.object({ name: z.string(), url: z.string().optional(), status }))
      .default([]),
    parentResponsibilities: i18nString.optional(),
  }),
  dataController: z.object({
    name: fact(z.string()),
    address: fact(z.string()),
    companyId: fact(z.string()),
    email: fact(z.string()),
    dpoContact: fact(z.string()),
  }),
  privacyNotice: z.object({
    version: z.string(),
    effectiveDate: z.string().optional(),
    status,
  }),
  marketingConsent: z.object({
    enabled: z.boolean().default(false),
    purpose: i18nString.optional(),
    text: i18nString.optional(),
    textVersion: z.string().optional(),
  }),
  instructionLanguages: fact(z.array(locale)),
  social: z.array(z.object({ network: z.string(), url: z.string(), status })).default([]),
  seoDefaults: z.object({ siteName: i18nString, ogImage: image }),
});

const seo = z.object({
  title: z.string(),
  description: z.string(),
  ogImage: image,
});

export const pagesSchema = z.object({
  key: z.enum([
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
  ]),
  seo,
  /** Typed per page by the page lanes; each section carries its own status. */
  sections: z
    .record(
      z.string(),
      z.object({ status: status.default('draft'), reviewNote }).catchall(z.unknown()),
    )
    .default({}),
  ...entry,
});

export const pillarsSchema = z.object({
  key: z.enum(['montessori', 'respectful', 'constructivist', 'hejny']),
  order: z.number().int(),
  title: z.string(),
  anchor: z.string(),
  summary: z.string(),
  parentBenefits: z.array(z.string()).default([]),
  whatItMeans: z.string(),
  inPractice: z.string(),
  examples: z.array(z.string()).default([]),
  benefits: z.string(),
  parentsCanExpect: z.string(),
  disclaimer: z.string().optional(),
  illustration: image,
  ...entry,
});

export const DAY_KINDS = [
  'arrival',
  'independent',
  'guided',
  'project',
  'math_language',
  'outdoor',
  'creative',
  'rest',
  'social',
  'reflection',
] as const;

export const dayScheduleSchema = z.object({
  isExample: z.literal(true).default(true),
  disclaimer: z.string(),
  items: z.array(
    z.object({
      kind: z.enum(DAY_KINDS),
      approxTime: fact(z.string()).optional(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  ...entry,
});

export const FAQ_CATEGORY_KEYS = [
  'philosophy',
  'legal',
  'enrollment',
  'daily',
  'parents',
  'costs',
  'location',
  'language_support',
] as const;

export const faqCategoriesSchema = z.object({
  key: z.enum(FAQ_CATEGORY_KEYS),
  title: z.string(),
  order: z.number().int(),
  ...entry,
});

export const faqItemsSchema = z.object({
  id: z.string(),
  category: z.enum(FAQ_CATEGORY_KEYS),
  question: z.string(),
  answer: z.string(),
  order: z.number().int().default(0),
  featuredOnHome: z.boolean().default(false),
  /** Settings paths whose facts the answer depends on, e.g. "settings.fees". */
  dependsOnFacts: z.array(z.string()).default([]),
  ...entry,
});

export const teamSchema = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string().optional(),
  photo: image,
  photoRightsConfirmed: z.boolean().default(false),
  qualifications: z.string().optional(),
  order: z.number().int().default(0),
  ...entry,
});

export const gallerySchema = z.object({
  image: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  kind: z.enum(['venue', 'materials', 'outdoor', 'creative', 'illustrative']),
  isIllustrative: z.boolean().default(false),
  source: z.string().optional(),
  licence: z.string().optional(),
  rightsConfirmed: z.boolean().default(false),
  ...entry,
});

export const POST_CLUSTERS = [
  'respectful',
  'montessori',
  'hejny',
  'constructivism',
  'choosing',
  'legal',
  'independence',
] as const;

export const postsSchema = z.object({
  translationKey: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  cluster: z.enum(POST_CLUSTERS),
  publishedAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  /** Team member id, or "editorial". */
  author: z.string().default('editorial'),
  cover: z.object({ image: z.string(), alt: z.string() }).optional(),
  seo: seo.partial().optional(),
  legalReviewRequired: z.boolean().default(false),
  legalReviewedAt: z.coerce.date().optional(),
  ...entry,
});

/** ui dictionaries: flat key -> string; key parity across locales is a unit test (i18n lane). */
export const UI_NAMESPACES = [
  'common',
  'nav',
  'forms',
  'validation',
  'email',
  'admin',
  'seo',
  'status',
] as const;
export const uiSchema = z.record(z.string(), z.string());
