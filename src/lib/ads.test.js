import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readAds, adsTxt, adsAllowedOn, adsScript, withAdsBody, ADS, GOOGLE_TAG_ID } from './ads.js';
import { maybe } from '../i18n/index.js';
import { LOCALES } from '../i18n/locales.js';
import { contentSecurityPolicy, headersFile } from '../security/integration.mjs';

const CLIENT = 'ca-pub-1234567890123456';

describe('AdSense settings', () => {
  test('site verification is configured by default but ads remain off', () => {
    assert.equal(readAds({}).client, 'ca-pub-4508143583458824');
    assert.equal(readAds({}).show, false);
    assert.equal(ADS.show, false);
    assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: '' }), null);
  });

  test('a malformed publisher ID keeps AdSense off', () => {
    for (const bad of ['pub-1234567890123456', 'ca-pub-123', 'ca-pub-12345678901234567', ' ca-pub-x234567890123456']) {
      assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: bad }), null, bad);
    }
  });

  test('the publisher ID alone: verification, ads.txt and the policy, but no ads', () => {
    const ads = readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT });
    assert.deepEqual(ads, { client: CLIENT, pub: 'pub-1234567890123456', show: false, slot: null });
  });

  test('ads on, and an optional 10-digit ad unit', () => {
    assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_ADS: 'ON' }).show, true);
    assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_ADS: 'yes' }).show, false);
    assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_SLOT: '1234567890' }).slot, '1234567890');
    assert.equal(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_SLOT: '12345' }).slot, null);
  });

  test('ads.txt is the line AdSense asks for', () => {
    assert.equal(adsTxt(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT })), `google.com, pub-1234567890123456, DIRECT, ${GOOGLE_TAG_ID}\n`);
  });

  test('never on the store, the policies or contact', () => {
    for (const p of ['/store', '/store/kruti-dev-7-day-starter', '/store/thanks', '/privacy-policy', '/terms', '/refund-policy', '/delivery-policy', '/contact']) {
      assert.equal(adsAllowedOn(p), false, p);
    }
    for (const p of ['/', '/unicode-to-kruti-dev', '/kruti-dev-excel-to-unicode', '/guides/kruti-dev-typing-rules-matras-reph-half-letters']) {
      assert.equal(adsAllowedOn(p), true, p);
    }
  });

  test('never on a page that is only a list of links to other pages', () => {
    for (const p of ['/all-converters', '/guides']) assert.equal(adsAllowedOn(p), false, p);
    // ...but a guide itself has an article to sit beside
    assert.equal(adsAllowedOn('/guides/install-kruti-dev-010-font-windows'), true);
  });

  test('the loader runs only on the live host and fills every unit', () => {
    const js = adsScript(readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_ADS: 'on' }), 'https://mykrutidev.com');
    assert.match(js, /location\.hostname !== "mykrutidev\.com"/);
    assert.match(js, /adsbygoogle\.js\?client=ca-pub-1234567890123456/);
    assert.match(js, /adsbygoogle\.push/);
  });
});

describe('Content-Security-Policy with and without ads', () => {
  const off = contentSecurityPolicy(["'sha256-x'"]);
  const verifying = contentSecurityPolicy(["'sha256-x'"], readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT }));
  const on = contentSecurityPolicy(["'sha256-x'"], readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_ADS: 'on' }));

  test('no ad address until ads are switched on', () => {
    assert.doesNotMatch(off, /googlesyndication|doubleclick|fundingchoices/);
    assert.equal(verifying, off);
  });

  test('with ads on: the ad script, its frames and the consent message are allowed', () => {
    const dir = (name) => on.split('; ').find((d) => d.startsWith(`${name} `));
    assert.match(dir('script-src'), /https:\/\/pagead2\.googlesyndication\.com/);
    assert.match(dir('frame-src'), /https:\/\/\*\.doubleclick\.net/);
    assert.match(dir('script-src'), /fundingchoicesmessages\.google\.com/);
    // Still no inline script but the hashed ones, and still no other site may frame us.
    assert.doesNotMatch(dir('script-src'), /unsafe-inline|unsafe-eval/);
    assert.match(on, /frame-ancestors 'none'/);
  });

  test('COOP lets an ad open its tab only once ads are on', () => {
    assert.match(headersFile([]), /Cross-Origin-Opener-Policy: same-origin\n/);
    assert.match(headersFile([], readAds({ PUBLIC_ADSENSE_CLIENT: CLIENT, PUBLIC_ADSENSE_ADS: 'on' })), /Cross-Origin-Opener-Policy: same-origin-allow-popups/);
  });
});

describe('the privacy policy\'s advertising section', () => {
  const GA_END = '<p>Opt out: <a href="https://tools.google.com/dlpage/gaoptout">add-on</a>.</p>';

  test('goes in right after the Google Analytics section, in a new list', () => {
    const body = ['a', GA_END, 'b'];
    const out = withAdsBody(body, ['ads1', 'ads2']);
    assert.deepEqual(out, ['a', GA_END, 'ads1', 'ads2', 'b']);
    assert.deepEqual(body, ['a', GA_END, 'b'], 'the page\'s own list is not edited');
    assert.notEqual(out, body);
  });

  test('goes at the end when there is no Analytics section, and nothing changes without it', () => {
    assert.deepEqual(withAdsBody(['a', 'b'], ['ads']), ['a', 'b', 'ads']);
    const body = ['a', 'b'];
    const same = withAdsBody(body, []);
    assert.deepEqual(same, body);
    assert.notEqual(same, body, 'a copy even when there is nothing to add');
  });

  test('rendering the real policy again and again never grows the dictionary', () => {
    for (const lang of LOCALES) {
      const key = 'pages./privacy-policy.body';
      const before = maybe(lang, key).length;
      const ads = maybe(lang, 'pages./privacy-policy.adsBody');
      assert.ok(ads.length > 0, `${lang} has an advertising section`);
      for (let i = 0; i < 3; i++) assert.equal(withAdsBody(maybe(lang, key), ads).length, before + ads.length, `${lang} render ${i + 1}`);
      assert.equal(maybe(lang, key).length, before, `${lang}: the shared list is unchanged`);
    }
  });
});
