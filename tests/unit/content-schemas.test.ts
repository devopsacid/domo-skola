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
