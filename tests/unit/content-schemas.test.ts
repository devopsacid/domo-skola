import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fact, settingsSchema, faqItemsSchema } from '../../src/content-schemas';
import { z } from 'astro/zod';

describe('Fact<T>', () => {
  const f = fact(z.string());
  it('defaults to a null draft value', () => {
    expect(f.parse({})).toEqual({ value: null, status: 'draft' });
  });
  it('rejects unknown statuses', () => {
    expect(f.safeParse({ value: 'x', status: 'published' }).success).toBe(false);
  });
});

describe('content models', () => {
  it('the checked-in settings placeholder is valid and has no verified facts', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../../src/content/settings/settings.json', import.meta.url), 'utf8'),
    );
    const parsed = settingsSchema.parse(raw);
    expect(JSON.stringify(parsed)).not.toContain('"verified"');
  });
  it('entries default to draft', () => {
    const item = faqItemsSchema.parse({
      id: 'a',
      category: 'legal',
      question: 'q',
      answer: 'a',
    });
    expect(item.status).toBe('draft');
  });
});

import * as schemas from '../../src/content-schemas';

describe('verifiedValue', () => {
  it('returns the value only for verified facts', () => {
    expect(schemas.verifiedValue({ value: 'x', status: 'verified' })).toBe('x');
    expect(schemas.verifiedValue({ value: 'x', status: 'needs-review' })).toBeNull();
    expect(schemas.verifiedValue({ value: 'x', status: 'draft' })).toBeNull();
    expect(schemas.verifiedValue({ value: null, status: 'verified' })).toBeNull();
    expect(schemas.verifiedValue(undefined)).toBeNull();
  });
});

describe('collection schemas', () => {
  const collections = {
    pages: schemas.pagesSchema,
    pillars: schemas.pillarsSchema,
    daySchedule: schemas.dayScheduleSchema,
    faqCategories: schemas.faqCategoriesSchema,
    faqItems: schemas.faqItemsSchema,
    team: schemas.teamSchema,
    gallery: schemas.gallerySchema,
    posts: schemas.postsSchema,
  };
  for (const [name, schema] of Object.entries(collections)) {
    it(`${name} has a status key that rejects unknown values`, () => {
      expect(Object.keys(schema.shape)).toContain('status');
      expect(schema.shape.status.safeParse('published').success).toBe(false);
      for (const ok of ['draft', 'needs-review', 'verified'])
        expect(schema.shape.status.safeParse(ok).success).toBe(true);
    });
  }
});
