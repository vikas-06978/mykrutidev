import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { GA_ID, analyticsScript } from './analytics.js';
import { SITE } from './routes.js';

/** Run the tag as a page on `hostname` would, and report what it did. */
function runOn(hostname) {
  const added = [];
  const window = {
    location: { hostname },
    document: { createElement: () => ({}), head: { appendChild: (el) => added.push(el) } },
  };
  window.window = window;
  runInNewContext(analyticsScript(), window);
  // Copied out of the sandbox, so its objects compare like this realm's.
  return { added, dataLayer: window.dataLayer && JSON.parse(JSON.stringify(window.dataLayer.map((args) => [...args]))) };
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

test('anywhere else (dev server, tests, Cloudflare previews): does nothing', () => {
  for (const host of ['localhost', '127.0.0.1', 'mykrutidev.pages.dev', 'abc123.mykrutidev.pages.dev', 'www.mykrutidev.com.evil.test']) {
    const { added, dataLayer } = runOn(host);
    assert.deepEqual(added, [], host);
    assert.equal(dataLayer, undefined, host);
  }
});
