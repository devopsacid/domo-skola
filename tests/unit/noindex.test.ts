import { describe, expect, it } from 'vitest';
import { isNoindex } from '../../src/shared/noindex';

describe('isNoindex', () => {
  it('defaults to on', () => {
    expect(isNoindex(undefined)).toBe(true);
    expect(isNoindex('')).toBe(true);
    expect(isNoindex('yes')).toBe(true);
  });
  it('turns off only for explicit false values', () => {
    for (const v of ['false', '0', 'off', 'FALSE', ' false ']) expect(isNoindex(v)).toBe(false);
  });
});
