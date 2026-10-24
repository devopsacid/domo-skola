/**
 * FAQ search and deep links (system.md §6.7), bundled by Astro as an external module.
 * Progressive enhancement: without this script every item is visible and grouped.
 * - Marks the search field ready (CSS shows it at first paint wherever `scripting` is
 *   supported, so revealing it causes no layout shift); filters items by question and answer, diacritics ignored.
 * - Opens matches and wraps the matched text in <mark> (text nodes only, never HTML).
 * - Hides empty categories and their nav links; shows the no-results block.
 * - Announces the count in a polite status region; Esc clears the field.
 * - `#<item-id>` (on load and on hashchange) opens that item and focuses its summary.
 */
import { matches, ranges, terms } from './match';

const root = document.querySelector<HTMLElement>('[data-faq]');
if (root) init(root);

function init(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>('[data-faq-search]');
  const input = root.querySelector<HTMLInputElement>('[data-faq-input]');
  const status = root.querySelector<HTMLElement>('[data-faq-status]');
  const none = root.querySelector<HTMLElement>('[data-faq-none]');
  const items = [...root.querySelectorAll<HTMLDetailsElement>('[data-faq-item]')];
  const cats = [...root.querySelectorAll<HTMLElement>('[data-faq-cat]')];
  // Text-only elements whose text may be marked: question and answer paragraphs.
  const marked = new Map<HTMLDetailsElement, { el: HTMLElement; text: string }[]>();
  for (const item of items) {
    const els = [
      ...item.querySelectorAll<HTMLElement>('.faq-item__q-text, .faq-item__a > p'),
    ].filter((el) => el.children.length === 0);
    marked.set(item, els.map((el) => ({ el, text: el.textContent ?? '' })));
  }
  const haystack = new Map(items.map((i) => [i, i.textContent ?? '']));
  let filtering = false;

  function mark(el: HTMLElement, text: string, q: string[]) {
    const rs = ranges(text, q);
    if (!rs.length) {
      if (el.childNodes.length !== 1 || el.firstChild?.nodeType !== Node.TEXT_NODE)
        el.textContent = text;
      return;
    }
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [a, b] of rs) {
      if (a > at) frag.append(text.slice(at, a));
      const m = document.createElement('mark');
      m.className = 'faq-match';
      m.textContent = text.slice(a, b);
      frag.append(m);
      at = b;
    }
    if (at < text.length) frag.append(text.slice(at));
    el.replaceChildren(frag);
  }

  function apply(query: string) {
    const q = terms(query);
    let count = 0;
    for (const item of items) {
      const hit = matches(haystack.get(item) ?? '', q);
      item.hidden = !hit;
      if (hit) count++;
      if (q.length) item.open = hit;
      else if (filtering) item.open = false;
      for (const { el, text } of marked.get(item) ?? []) mark(el, text, q);
    }
    for (const cat of cats) {
      const empty = !cat.querySelector('[data-faq-item]:not([hidden])');
      cat.hidden = empty;
      const link = root.querySelector<HTMLElement>(`.toc a[href="#${CSS.escape(cat.id)}"]`);
      link?.closest('li')?.toggleAttribute('hidden', empty);
    }
    if (none) none.hidden = count > 0;
    if (status) {
      const tpl = q.length ? status.dataset.results : '';
      status.textContent = tpl ? tpl.replace('{n}', String(count)) : '';
    }
    filtering = q.length > 0;
  }

  if (box && input) {
    box.classList.add('is-ready');
    input.addEventListener('input', () => apply(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        apply('');
      }
    });
  }

  function openHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!(target instanceof HTMLDetailsElement) || !items.includes(target)) return;
    if (target.hidden && input) {
      input.value = '';
      apply('');
    }
    target.open = true;
    const summary = target.querySelector<HTMLElement>('summary');
    // On first load the browser's own fragment handling runs after this module and drops
    // focus to <body>; focusing again after `load` (next frame) keeps it on the item.
    if (document.readyState === 'complete') summary?.focus();
    else {
      summary?.focus();
      window.addEventListener('load', () => requestAnimationFrame(() => summary?.focus()), {
        once: true,
      });
    }
  }
  window.addEventListener('hashchange', openHash);
  openHash();
}
