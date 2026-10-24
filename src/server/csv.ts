/**
 * CSV output with formula-injection escaping (ADR-0001 D14, OWASP CSV injection).
 * A text cell that starts with = + - @ TAB or CR gets a leading apostrophe, which spreadsheets
 * show as text. RFC 4180 quoting applies afterwards.
 */
/** UTF-8 BOM so Excel opens the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  opts: { bom?: boolean } = {},
): string {
  const lines = [columns.map(escapeCsvCell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvCell(row[c])).join(','));
  return `${opts.bom ? BOM : ''}${lines.join('\r\n')}\r\n`;
}
