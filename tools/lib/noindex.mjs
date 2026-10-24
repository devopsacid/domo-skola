/** Site-wide noindex switch: on unless the value is explicitly false, 0 or off. Mirrors src/shared/noindex.ts (parity test). */
export function isNoindex(value) {
  const v = (value ?? '').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'off');
}
