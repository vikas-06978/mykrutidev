import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { GA_ID, analyticsScript } from './analytics.js';
import { SITE } from './routes.js';

/**
 * Run the tag as a page on `hostname` would, and report what it did.
 * `readyState` is how far the page has got when the tag runs; `idle` stands in
 * for the browser's idle callback (undefined: a browser without one).
 */
function runOn(hostname, { readyState = 'complete', idle = (fn) => fn() } = {}) {
  const added = [];
  const onLoad = [];
  const timers = [];
  const window = {
    location: { hostname },
    document: { readyState, createElement: () => ({}), head: { appendChild: (el) => added.push(el) } },
    addEventListener: (type, fn) => type === 'load' && onLoad.push(fn),
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
  };
  if (idle) window.requestIdleCallback = (fn, opts) => idle(fn, opts);
  window.window = window;
  runInNewContext(analyticsScript(), window);
  // Copied out of the sandbox, so its objects compare like this realm's.
  const dataLayer = () => window.dataLayer && JSON.parse(JSON.stringify(window.dataLayer.map((args) => [...args])));
  return { added, onLoad, timers, dataLayer: dataLayer() };
}

test('on the live site: loads gtag.js for this ID, with advertising features off', () => {
  const { added, dataLayer } = runOn(new URL(SITE).hostname);
  assert.equal(added.length, 1);
  assert.equal(added[0].src, `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  assert.equal(added[0].async, true);
  assert.equal(dataLayer[0][0], 'js');
  assert.deepEqual(dataLayer[1], [
    'config',
    GA_ID,
    { allow_google_signals: false, allow_ad_personalization_signals: false },
  ]);
});

test('the visit is queued at once, but gtag.js is fetched only after load and when idle', () => {
  const live = new URL(SITE).hostname;
  let waiting;
  const r = runOn(live, { readyState: 'loading', idle: (fn, opts) => (waiting = { fn, opts }) });
  // Before the page has loaded: the config is queued, nothing is fetched.
  assert.equal(r.dataLayer[1][0], 'config');
  assert.equal(r.added.length, 0);
  assert.equal(r.onLoad.length, 1);
  assert.equal(waiting, undefined);
  // The load event: it asks the browser for an idle moment, with a limit so a busy page still counts.
  r.onLoad[0]();
  assert.equal(r.added.length, 0);
  assert.equal(waiting.opts.timeout, 4000);
  // The idle moment: now it is fetched.
  waiting.fn();
  assert.equal(r.added.length, 1);
  assert.match(r.added[0].src, /googletagmanager\.com\/gtag\/js/);
});

test('a page that has already loaded does not wait for a load event that has passed', () => {
  let asked = 0;
  const r = runOn(new URL(SITE).hostname, { readyState: 'complete', idle: () => asked++ });
  assert.equal(r.onLoad.length, 0);
  assert.equal(asked, 1);
});

test('without requestIdleCallback it falls back to a short timer, never to nothing', () => {
  const r = runOn(new URL(SITE).hostname, { readyState: 'complete', idle: null });
  assert.equal(r.added.length, 0);
  assert.equal(r.timers.length, 1);
  r.timers[0].fn();
  assert.equal(r.added.length, 1);
});

test('anywhere else (dev server, tests, Cloudflare previews): does nothing', () => {
  for (const host of ['localhost', '127.0.0.1', 'mykrutidev.pages.dev', 'abc123.mykrutidev.pages.dev', 'www.mykrutidev.com.evil.test']) {
    const { added, dataLayer } = runOn(host);
    assert.deepEqual(added, [], host);
    assert.equal(dataLayer, undefined, host);
  }
});
