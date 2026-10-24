import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from '../../../src/server/csv';

describe('escapeCsvCell', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])('prefixes a leading %j with an apostrophe', (c) => {
    const out = escapeCsvCell(`${c}SUM(A1)`);
    expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('neutralises classic payloads', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(escapeCsvCell('@cmd|calc')).toBe("'@cmd|calc");
  });
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('l1\nl2')).toBe('"l1\nl2"');
  });
  it('renders null and undefined as empty, numbers and booleans plainly', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell(3)).toBe('3');
    expect(escapeCsvCell(true)).toBe('1');
    expect(escapeCsvCell(false)).toBe('0');
  });
  it('does not touch safe text', () => {
    expect(escapeCsvCell('Ružomberok')).toBe('Ružomberok');
    expect(escapeCsvCell('a-b+c=d')).toBe('a-b+c=d');
  });
});

describe('toCsv', () => {
  it('emits a BOM, a header row and CRLF line endings', () => {
    const out = toCsv(
      ['a', 'b'],
      [
        { a: 1, b: '=x' },
        { a: 2, b: null },
      ],
      { bom: true },
    );
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe("a,b\r\n1,'=x\r\n2,\r\n");
  });
  it('omits the BOM by default', () => {
    expect(toCsv(['a'], []).startsWith('a')).toBe(true);
  });
  it('escapes header cells too', () => {
    expect(toCsv(['=a'], [])).toBe("'=a\r\n");
  });
});

describe('phone numbers', () => {
  it('are not apostrophe-prefixed when the whole value looks like a phone number', () => {
    for (const p of ['+421 900 123 456', '+420601234567', '0900/123.456', '(02) 5555 1234']) {
      expect(escapeCsvCell(p)).toBe(p);
    }
  });
  it('keep the escape for everything else that starts with a formula character', () => {
    for (const v of ['+1', '+421 900 1', '-2+3', '=1234567', '+421900123456=1', '@1234567', '+4219001234567890123456789012345678']) {
      expect(escapeCsvCell(v).startsWith("'") || escapeCsvCell(v).startsWith('"\'')).toBe(true);
    }
  });
});
