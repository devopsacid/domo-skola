import { describe, expect, it } from 'vitest';
import { formPageStrings, formStrings, fill } from '../../../src/i18n/forms';
import { LOCALES } from '../../../src/shared/enums';

const keys = (v: unknown, prefix = ''): string[] =>
  Array.isArray(v)
    ? [`${prefix}[${v.length}]`, ...v.flatMap((x, i) => keys(x, `${prefix}[${i}]`))]
    : v && typeof v === 'object'
      ? Object.entries(v).flatMap(([k, x]) => keys(x, prefix ? `${prefix}.${k}` : k))
      : [prefix];

describe('forms dictionaries', () => {
  it('have the same keys and array lengths in sk, cs and en', () => {
    for (const get of [formStrings, formPageStrings]) {
      const base = keys(get('sk')).sort();
      for (const l of LOCALES) expect(keys(get(l)).sort(), l).toEqual(base);
    }
  });
  it('have no empty strings except help texts that are intentionally blank', () => {
    for (const l of LOCALES) {
      const flat = (v: unknown, path: string): string[] =>
        typeof v === 'string'
          ? v === '' && !path.endsWith('.help')
            ? [path]
            : []
          : v && typeof v === 'object'
            ? Object.entries(v).flatMap(([k, x]) => flat(x, `${path}.${k}`))
            : [];
      expect(flat(formStrings(l), l)).toEqual([]);
      expect(flat(formPageStrings(l), l)).toEqual([]);
    }
  });
  it('keep the SK confirmation sentence verbatim from the brief', () => {
    expect(formPageStrings('sk').enrolSubmitted.confirmation).toBe(
      'Ďakujeme za váš záujem. Vašu prihlášku sme prijali a ozveme sa vám ohľadom ďalšieho postupu.',
    );
  });
  it('keeps placeholders consistent across locales', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const sk = formStrings('sk');
    for (const l of LOCALES) {
      const t = formStrings(l);
      expect(ph(t.common.fail.rate.text)).toEqual(ph(sk.common.fail.rate.text));
      expect(ph(t.enrol.stepOf)).toEqual(['n', 'total']);
      expect(ph(t.enrol.documentTitle)).toEqual(['n', 'total']);
      expect(ph(t.common.time.seconds)).toEqual(['n']);
    }
  });
  it('fill replaces known placeholders only', () => {
    expect(fill('a {n} {x}', { n: 2 })).toBe('a 2 {x}');
  });
});
