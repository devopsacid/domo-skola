/**
 * Mounts an island without Astro's island runtime. Astro's `client:*` directives add an inline
 * <style> and inline <script> to every page, which the CSP (style-src 'self') forbids (ADR-0001 A4.1).
 *
 * - `hydrate` (default): the page renders the component at build time inside
 *   `<div data-island data-props="...">` (a complete no-JS form) and the module hydrates it with the same props.
 * - `render`: for a client-only island with no server HTML (the admin app); renders into the empty element.
 *   `data-props` is optional there and defaults to `{}`.
 */
import { h, hydrate, render, type ComponentType } from 'preact';

export type MountMode = 'hydrate' | 'render';

/** Parsed `data-props`, or null when present but not valid JSON. */
export function readProps<P extends object>(el: HTMLElement, optional: boolean): P | null {
  const raw = el.dataset.props;
  if (raw === undefined && optional) return {} as P;
  try {
    const parsed: unknown = JSON.parse(raw ?? '');
    return parsed !== null && typeof parsed === 'object' ? (parsed as P) : null;
  } catch {
    return null;
  }
}

export function mountIsland<P extends object>(
  selector: string,
  Component: ComponentType<P>,
  mode: MountMode = 'hydrate',
): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  // A bad payload leaves server-rendered HTML as it is: it still works without JS.
  const props = readProps<P>(el, mode === 'render');
  if (!props) return;
  if (mode === 'render') render(h(Component, props), el);
  else hydrate(h(Component, props), el);
}
