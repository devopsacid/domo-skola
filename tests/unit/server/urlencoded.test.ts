import { describe, expect, it } from 'vitest';
import { decodeUrlencoded } from '../../../src/server/forms/urlencoded';
import { CHECKBOX_FIELDS } from '../../../src/shared/schemas/common';

const p = (s: string) => new URLSearchParams(s);

describe('decodeUrlencoded', () => {
  it('maps top-level locale and hp, everything else into fields', () => {
    const r = decodeUrlencoded(p('locale=sk&hp=&parent_name=Jana&email=j%40example.sk'));
    expect(r).toEqual({
      ok: true,
      value: { locale: 'sk', hp: '', fields: { parent_name: 'Jana', email: 'j@example.sk' } },
    });
  });

  it('turns only the value "on" into true, for listed checkbox fields only', () => {
    for (const f of CHECKBOX_FIELDS) {
      const on = decodeUrlencoded(p(`${f}=on`));
      expect(on.ok && on.value.fields[f]).toBe(true);
      for (const other of ['true', '1', 'yes', 'ON', '', 'off']) {
        const r = decodeUrlencoded(p(`${f}=${other}`));
        expect(r.ok && f in r.value.fields).toBe(false);
      }
    }
    const r = decodeUrlencoded(p('message=on'));
    expect(r.ok && r.value.fields.message).toBe('on');
  });

  it('leaves a missing checkbox absent', () => {
    const r = decodeUrlencoded(p('parent_name=Jana'));
    expect(r.ok && 'privacy_ack' in r.value.fields).toBe(false);
  });

  it('rejects a repeated key as bad_request', () => {
    expect(decodeUrlencoded(p('email=a%40b.sk&email=c%40d.sk'))).toEqual({
      ok: false,
      error: 'bad_request',
    });
    expect(decodeUrlencoded(p('hp=&hp=x')).ok).toBe(false);
    expect(decodeUrlencoded(p('locale=sk&locale=en')).ok).toBe(false);
  });

  it('never forwards elapsedMs', () => {
    const r = decodeUrlencoded(p('elapsedMs=9000&locale=sk'));
    expect(r.ok && 'elapsedMs' in r.value).toBe(false);
    expect(r.ok && 'elapsedMs' in r.value.fields).toBe(false);
  });

  it('is safe against prototype keys', () => {
    const r = decodeUrlencoded(p('__proto__=x&constructor=y'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.getPrototypeOf(r.value.fields)).toBeNull();
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    }
  });
});
