/**
 * The installable app: registers the service worker (src/pwa/sw.js, built
 * into dist/sw.js) and drives the header's "Install app" button.
 *
 * The button is only ever shown after the browser itself says the site can be
 * installed (`beforeinstallprompt` - Chrome, Edge, Samsung Internet). Where
 * that never fires (Safari, Firefox) it stays hidden. It is a button, never a
 * popup, and × hides it for good on this device.
 */

const DISMISS_KEY = 'mkd-install-dismissed';

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // Well after the page is up: the first visit downloads the rest of the
    // site for offline use, and none of that may compete with this page's own
    // loading or with the first keystroke.
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1));
    const register = () =>
      setTimeout(() => idle(() => navigator.serviceWorker.register('/sw.js').catch(() => {})), 2000);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } else {
    // `astro dev` never has one. A worker left over from a `preview` on the
    // same port would otherwise serve stale pages to the dev server.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Install button
// ---------------------------------------------------------------------------

const boxes = [...document.querySelectorAll('[data-install]')];

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function show(on) {
  for (const b of boxes) b.hidden = !on;
}

/** @type {any} The deferred beforeinstallprompt event. */
let deferred = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Keeps Chrome's own install banner away: the header button is the offer.
  e.preventDefault();
  deferred = e;
  if (!dismissed()) show(true);
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  show(false);
});

for (const box of boxes) {
  box.querySelector('[data-install-go]')?.addEventListener('click', async () => {
    if (!deferred) return show(false);
    const event = deferred;
    deferred = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // The browser declined to show its dialog; nothing to do.
    }
    // Either way the browser will not hand out this prompt again this visit.
    show(false);
  });

  box.querySelector('[data-install-dismiss]')?.addEventListener('click', () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Hidden for this visit only.
    }
    show(false);
  });
}
