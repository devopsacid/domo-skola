/** Site-wide noindex switch. On unless PUBLIC_NOINDEX is explicitly false, 0 or off. */
export function isNoindex(value: string | undefined | null): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'off');
}
