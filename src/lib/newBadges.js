/**
 * "New" badges: a small label beside a new page's links (the header menus and
 * the home page card), so a returning visitor notices it.
 *
 * A badge goes away for good, in that visitor's browser, once they open the
 * page (by any link, or straight from a search). Until then it stays, across
 * refreshes. After `until` it is gone for everyone: a build after that date
 * leaves it out, and a page built before it hides it in the browser.
 *
 * What was seen is kept in localStorage only (key SEEN_KEY): nothing is sent
 * anywhere. The script that applies it runs before the first paint, so a
 * badge that is already seen never shows and then disappears.
 */
import { LOCALES } from '../i18n/locales.js';

/** @type {{ key: string, path: string, until: string }[]} until: last day shown, India time. */
export const NEW_BADGES = [{ key: 'passages', path: '/hindi-typing-practice-passages', until: '2026-11-29' }];

export const SEEN_KEY = 'mkd-seen-new';

/** End of the `until` day, India time, as a timestamp. */
const endOf = (until) => Date.parse(`${until}T23:59:59+05:30`);

/** The badges still running at `now` (the build's own date for a build). */
export const activeBadges = (now = Date.now()) => NEW_BADGES.filter((b) => now <= endOf(b.until));

/** The badge key for a page path (no language prefix), or null. */
export function badgeFor(path, now = Date.now()) {
  return activeBadges(now).find((b) => b.path === path)?.key ?? null;
}

/**
 * CSS that hides a badge once <html data-new-hide> lists its key. Static, so it
 * is the same on every page.
 */
export const badgeCss = (badges = NEW_BADGES) =>
  badges.map((b) => `[data-new-hide~="${b.key}"] [data-new-badge="${b.key}"]{display:none}`).join('');

/**
 * The inline script, the same text on every page (its hash is in the CSP):
 * marks the page being opened as seen, hides seen and expired badges, and
 * marks a badge seen the moment its link is clicked (and counts that click
 * in Google Analytics, where gtag exists: the badge's key, nothing else).
 */
export function badgeScript(badges = NEW_BADGES) {
  const list = JSON.stringify(badges.map((b) => ({ k: b.key, p: b.path, e: endOf(b.until) })));
  const prefix = `^/(?:${LOCALES.filter((l) => l !== 'en').join('|')})(?=/)`;
  return `(function () {
  var B = ${list};
  var KEY = ${JSON.stringify(SEEN_KEY)};
  var root = document.documentElement;
  var seen = [];
  function load() { try { seen = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { seen = []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {} }
  function mark(k) { if (seen.indexOf(k) < 0) { seen.push(k); save(); } }
  var path = location.pathname.replace(new RegExp(${JSON.stringify(prefix)}), '').replace(/\\/$/, '') || '/';
  function apply() {
    load();
    var hide = [];
    for (var i = 0; i < B.length; i++) {
      if (B[i].p === path) mark(B[i].k);
      if (seen.indexOf(B[i].k) >= 0 || Date.now() > B[i].e) hide.push(B[i].k);
    }
    root.setAttribute('data-new-hide', hide.join(' '));
  }
  apply();
  // A page brought back by Back keeps its old state: look again.
  addEventListener('pageshow', function (ev) { if (ev.persisted) apply(); });
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('[data-new-link]') : null;
    if (!a) return;
    var k = a.getAttribute('data-new-link');
    load();
    // Counted in Google Analytics while the badge still showed: which badge only.
    if (seen.indexOf(k) < 0) { try { if (typeof gtag === 'function') gtag('event', 'new_badge_click', { badge: k }); } catch (e) {} }
    mark(k); apply();
  }, true);
})();`;
}
