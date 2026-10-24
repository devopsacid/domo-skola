import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { brandNameFor } from '../../src/components/site/brand';

const fact = (
  status: 'draft' | 'needs-review' | 'verified',
  value: string | null = 'Domoškola',
) => ({
  value,
  status,
});

describe('brandNameFor', () => {
  it('shows the name in preview builds whatever its status', () => {
    for (const s of ['draft', 'needs-review', 'verified'] as const)
      expect(brandNameFor(fact(s), false)).toBe('Domoškola');
  });

  it('shows a verified name in strict builds', () => {
    expect(brandNameFor(fact('verified'), true)).toBe('Domoškola');
  });

  it('throws in strict builds unless the name is verified', () => {
    expect(() => brandNameFor(fact('needs-review'), true)).toThrow(/settings\.brandName/);
    expect(() => brandNameFor(fact('draft'), true)).toThrow(/settings\.brandName/);
  });

  it('throws when the name is empty', () => {
    expect(() => brandNameFor(fact('verified', null), false)).toThrow(/empty/);
    expect(() => brandNameFor(fact('needs-review', ''), false)).toThrow(/empty/);
  });

  it('fails a strict build with the current settings.json (name not verified yet)', () => {
    const settings = JSON.parse(readFileSync('src/content/settings/settings.json', 'utf8'));
    expect(settings.brandName.status).not.toBe('verified');
    expect(() => brandNameFor(settings.brandName, true)).toThrow(/CONTENT_STRICT=1/);
    expect(brandNameFor(settings.brandName, false)).toBe(settings.brandName.value);
  });
});
