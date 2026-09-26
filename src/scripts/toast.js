/**
 * A short confirmation at the bottom of the screen - "Copied ✓" - that fades
 * out on its own. Not a dialog: it takes no focus, blocks nothing and cannot
 * be missed-clicked. Fixed position, so it never moves the page (CLS 0).
 *
 * Silent to screen readers by default, because every caller already
 * announces the same thing through its own status region; pass
 * `announce: true` where nothing else does.
 */

/** @type {HTMLElement | null} */
let el = null;
/** @type {HTMLElement | null} */
let live = null;
let timer;

/**
 * @param {string} message
 * @param {{ announce?: boolean, ms?: number }} [opts]
 */
export function toast(message, { announce = false, ms = 1800 } = {}) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'mkd-toast';
    el.setAttribute('aria-hidden', 'true');
    live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    document.body.append(el, live);
  }
  el.textContent = message;
  // Restart the entrance when a second toast replaces the first.
  el.dataset.show = 'false';
  void el.offsetWidth;
  el.dataset.show = 'true';
  if (announce && live) live.textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (el) el.dataset.show = 'false';
    if (live) live.textContent = '';
  }, ms);
}
