import { describe, expect, it } from 'vitest';
import { readProps } from '../../../src/islands/mount';

const el = (props?: string) => ({ dataset: props === undefined ? {} : { props } }) as unknown as HTMLElement;

describe('readProps', () => {
  it('parses data-props', () => {
    expect(readProps(el('{"a":1}'), false)).toEqual({ a: 1 });
  });
  it('is null for missing props in hydrate mode', () => {
    expect(readProps(el(), false)).toBeNull();
  });
  it('defaults to {} for missing props in render mode', () => {
    expect(readProps(el(), true)).toEqual({});
  });
  it('is null for invalid or non-object JSON', () => {
    expect(readProps(el('{oops'), true)).toBeNull();
    expect(readProps(el('3'), false)).toBeNull();
    expect(readProps(el('null'), false)).toBeNull();
  });
});
