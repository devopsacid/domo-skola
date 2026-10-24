/**
 * Mounts a form island without Astro's island runtime. Astro's `client:*` directives add an inline
 * <style> and inline <script> to every page, which the CSP (style-src 'self') forbids. Instead the page
 * renders the component at build time inside `<div data-island data-props="...">` (a complete no-JS
 * form) and one external module hydrates it with the same props.
 */
import { h, hydrate, type ComponentType } from 'preact';

export function mountIsland<P extends object>(selector: string, Component: ComponentType<P>): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  let props: P;
  try {
    props = JSON.parse(el.dataset.props ?? '') as P;
  } catch {
    return; // leave the server-rendered form as it is: it still works without JS
  }
  hydrate(h(Component, props), el);
}
