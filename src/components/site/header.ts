/**
 * Header behaviour that HTML and CSS cannot do alone (bundled as an external module):
 * 1. Write the header's real height to --header-height, which feeds
 *    scroll-padding-top so anchors and focused fields never sit under the sticky
 *    header (WCAG 2.4.11). CSSOM setProperty is allowed under a strict style-src.
 * 2. Close the menu popover when keyboard focus leaves it, so focus never moves
 *    to page content hidden behind the open panel.
 * Without JS: the token fallback (4rem) applies and the popover still works natively.
 */
const header = document.querySelector<HTMLElement>('.site-header');
const root = document.documentElement;

if (header && 'ResizeObserver' in window) {
  const write = () => root.style.setProperty('--header-height', `${header.offsetHeight}px`);
  new ResizeObserver(write).observe(header);
  write();
}

const menu = document.getElementById('site-menu');
if (menu && 'showPopover' in menu) {
  menu.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (!next || menu.contains(next)) return;
    if (next instanceof HTMLElement && next.getAttribute('popovertarget') === 'site-menu') return;
    if (menu.matches(':popover-open')) menu.hidePopover();
  });
}
