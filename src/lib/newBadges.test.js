import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { NEW_BADGES, SEEN_KEY, activeBadges, badgeFor, badgeCss, badgeScript } from './newBadges.js';
import { getPage, isLive } from './routes.js';

const BADGES = [{ key: 'passages', path: '/hindi-typing-practice-passages', until: '2026-11-29' }];

/** Runs the inline script on a page at `pathname`, with a localStorage that may be missing. */
function run(pathname, { stored = null, now = Date.parse('2026-10-20T10:00:00+05:30'), storage = true, gtag } = {}) {
  const store = new Map(stored ? [[SEEN_KEY, stored]] : []);
  const attrs = {};
  const listeners = {};
  const ctx = {
    location: { pathname },
    localStorage: storage
      ? { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }
      : { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
    document: {
      documentElement: { setAttribute: (k, v) => (attrs[k] = v) },
      addEventListener: (type, fn) => (listeners[type] = fn),
    },
    addEventListener: () => {},
    ...(gtag ? { gtag } : {}),
    Date: class extends Date {
      static now() {
        return now;
      }
    },
  };
  vm.runInNewContext(badgeScript(BADGES), ctx);
  return { hide: attrs['data-new-hide'], seen: store.get(SEEN_KEY), click: listeners.click, attrs, store };
}

describe('"New" badges', () => {
  test('each badge is for a live page and has a real date', () => {
    for (const b of NEW_BADGES) {
      const page = getPage(b.path);
      assert.ok(page && isLive(page), b.path);
      assert.ok(!Number.isNaN(Date.parse(`${b.until}T00:00:00Z`)), b.until);
    }
  });

  test('a badge runs to the end of its last day, India time, then stops', () => {
    assert.equal(badgeFor('/hindi-typing-practice-passages', Date.parse('2026-11-29T23:00:00+05:30')), 'passages');
    assert.equal(badgeFor('/hindi-typing-practice-passages', Date.parse('2026-11-30T00:00:01+05:30')), null);
    assert.equal(badgeFor('/hindi-typing-test', Date.parse('2026-10-20T00:00:00Z')), null);
    assert.equal(activeBadges(Date.parse('2027-01-01T00:00:00Z')).length, 0);
  });

  test('the CSS hides a badge once its key is listed on <html>', () => {
    assert.equal(badgeCss(BADGES), '[data-new-hide~="passages"] [data-new-badge="passages"]{display:none}');
  });

  test('shown on other pages until the page is opened, in any language; then hidden for good', () => {
    assert.equal(run('/').hide, '');
    assert.equal(run('/hi/hindi-typing-test/').hide, '');
    const opened = run('/ta/hindi-typing-practice-passages/');
    assert.equal(opened.hide, 'passages');
    assert.deepEqual(JSON.parse(opened.seen), ['passages']);
    assert.equal(run('/', { stored: opened.seen }).hide, 'passages');
  });

  test('a click on a badge link hides it at once', () => {
    const page = run('/');
    assert.equal(page.attrs['data-new-hide'], '');
    page.click({ target: { closest: () => ({ getAttribute: () => 'passages' }) } });
    assert.equal(page.attrs['data-new-hide'], 'passages');
    assert.deepEqual(JSON.parse(page.store.get(SEEN_KEY)), ['passages']);
    // A click anywhere else changes nothing.
    const other = run('/');
    other.click({ target: { closest: () => null } });
    assert.equal(other.attrs['data-new-hide'], '');
  });

  test('a click on a badge still showing is counted once in analytics, with the badge key only', () => {
    const calls = [];
    const page = run('/', { gtag: (...a) => calls.push(a) });
    const ev = { target: { closest: () => ({ getAttribute: () => 'passages' }) } };
    page.click(ev);
    page.click(ev);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['event', 'new_badge_click', { badge: 'passages' }]]);
    // Without gtag (dev, preview, tests) the click still hides the badge.
    const plain = run('/');
    plain.click(ev);
    assert.equal(plain.attrs['data-new-hide'], 'passages');
  });

  test('after the last day it is hidden even on a page built before', () => {
    assert.equal(run('/', { now: Date.parse('2026-12-01T00:00:00Z') }).hide, 'passages');
  });

  test('with storage blocked the page still works and the badge simply shows', () => {
    assert.equal(run('/', { storage: false }).hide, '');
  });
});
