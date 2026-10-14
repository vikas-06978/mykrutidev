import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRODUCTS, STORE, STORE_SCHEMA, liveProducts, price, rupees, sellable, validateCheckout, newOrderId, ORDER_ID_RE } from './store.js';
import { BUSINESS, businessLines } from './business.js';
import { checkoutError, daysLeft, payUrlOk, readOrderFrom, thanksKey } from './storeClient.js';
import { PAGES, getPage, isLive } from './routes.js';
import { LOCALES } from '../i18n/locales.js';
import { DICTS } from '../i18n/index.js';

describe('the catalog', () => {
  test('ids are unique, slug-safe, and priced in whole paise', () => {
    const seen = new Set();
    for (const p of PRODUCTS) {
      assert.match(p.id, /^[a-z0-9-]+$/);
      assert.ok(!seen.has(p.id), `duplicate ${p.id}`);
      seen.add(p.id);
      assert.ok(Number.isInteger(p.pricePaise) && p.pricePaise >= 100, `${p.id} price`);
      assert.ok(p.file && !p.file.startsWith('/') && !p.file.includes('..'), `${p.id} file`);
      assert.match(p.fileName, /^[A-Za-z0-9._-]+\.pdf$/);
      assert.ok(['live', 'test', 'draft'].includes(p.status));
    }
  });

  test('every product has a page, in routes.js and in every language', () => {
    for (const p of PRODUCTS) {
      const page = getPage(`/store/${p.id}`);
      assert.ok(page, `${p.id} has no routes.js entry`);
      assert.equal(isLive(page), p.status === 'live');
      for (const lang of LOCALES) assert.ok(DICTS[lang].pages[`/store/${p.id}`], `${lang}: no text for ${p.id}`);
    }
  });

  test('test products sell only where STORE_TEST_PRODUCTS=1', () => {
    const t = PRODUCTS.find((p) => p.status === 'test');
    assert.equal(sellable(t, {}), false);
    assert.equal(sellable(t, { STORE_TEST_PRODUCTS: '1' }), true);
    assert.equal(sellable({ status: 'draft' }, { STORE_TEST_PRODUCTS: '1' }), false);
    assert.equal(sellable({ status: 'live' }, {}), true);
  });

  test('prices print as rupees', () => {
    assert.equal(rupees(19900), '199');
    assert.equal(rupees(19950), '199.50');
    assert.equal(price(100), '₹1');
  });

  test('the store pages are off the sitemap until a product is live, and the thanks page always', () => {
    assert.equal(isLive(getPage('/store')), liveProducts().length > 0);
    assert.equal(isLive(getPage('/store/thanks')), false);
    assert.ok(isLive(getPage('/refund-policy')) && isLive(getPage('/delivery-policy')));
  });

  test('a product that is on sale needs the seller details on /contact', () => {
    if (liveProducts().length === 0) return;
    assert.ok(BUSINESS.name.trim() && BUSINESS.address.trim() && BUSINESS.phone.trim(), 'fill in src/lib/business.js');
  });

  test('businessLines drops empty lines', () => {
    assert.deepEqual(businessLines({ name: ' A ', address: '', phone: '1' }), ['A', '1']);
    assert.deepEqual(businessLines({ name: '', address: '', phone: '' }), []);
  });
});

describe('checkout input', () => {
  test('accepts a plain order, lowercases the email', () => {
    const r = validateCheckout({ productId: 'x', email: ' A@B.in ', accept: true, lang: 'hi' });
    assert.deepEqual(r, { ok: true, value: { productId: 'x', email: 'a@b.in', lang: 'hi' } });
  });
  test('rejects what it should', () => {
    for (const body of [null, [], {}, { productId: 'x', email: 'nope', accept: true }, { productId: 'x', email: 'a@b.in' }]) {
      assert.equal(validateCheckout(body).ok, false);
    }
  });
  test('order ids are unguessable and well-formed', () => {
    const a = newOrderId();
    assert.match(a, ORDER_ID_RE);
    assert.notEqual(a, newOrderId());
  });
});

describe('the database schema', () => {
  test('db/store.sql holds exactly the statements the Functions run', () => {
    const sql = readFileSync(new URL('../../db/store.sql', import.meta.url), 'utf8');
    const norm = (s) => s.replace(/--.*$/gm, '').replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
    assert.equal(norm(sql), norm(STORE_SCHEMA.join(' ; ')));
  });
});

describe('the browser side', () => {
  test('only Razorpay addresses are followed', () => {
    assert.ok(payUrlOk('https://rzp.io/i/abc'));
    assert.ok(payUrlOk('https://pages.razorpay.com/x'));
    assert.ok(payUrlOk('https://razorpay.com/x'));
    for (const bad of ['http://rzp.io/i/a', 'https://evilrzp.io/a', 'https://rzp.io.evil.com/a', 'https://razorpay.com.evil.com/', 'javascript:alert(1)', '', null]) {
      assert.equal(payUrlOk(bad), false, String(bad));
    }
  });

  test('checkout errors map to a message that exists in every language', () => {
    const keys = new Set([429, 403, 400, 404, 503, 502, 0, 500].map((s) => checkoutError(s, s === 403 ? 'challenge-failed' : s === 400 ? 'invalid' : '')));
    for (const lang of LOCALES) for (const k of keys) assert.ok(DICTS[lang].store[k], `${lang}: store.${k}`);
    assert.equal(checkoutError(429), 'errRate');
    assert.equal(checkoutError(403, 'challenge-failed'), 'errChallenge');
    assert.equal(checkoutError(500), 'errGeneric');
  });

  test('every thanks state maps to a message that exists in every language', () => {
    for (const s of ['expired', 'refunded', 'failed', 'closed', 'pending', 'created', 'unverified', 'unknown', 'x']) {
      for (const lang of LOCALES) assert.ok(DICTS[lang].store[thanksKey(s)], `${lang}: ${s}`);
    }
  });

  test('the thanks page reads the order from the emailed link or from Razorpay', () => {
    const o = newOrderId();
    const t = 'a'.repeat(43);
    assert.deepEqual(readOrderFrom({ search: '', hash: `#o=${o}&t=${t}` }), { kind: 'link', order: o, token: t });
    assert.deepEqual(readOrderFrom({ search: `?razorpay_payment_link_reference_id=${o}&x=1`, hash: '' }), { kind: 'return', order: o });
    assert.equal(readOrderFrom({ search: '', hash: '#o=bad&t=bad' }), null);
    assert.equal(readOrderFrom({ search: '?razorpay_payment_link_reference_id=../etc', hash: '' }), null);
    assert.equal(readOrderFrom({ search: '', hash: '' }), null);
  });

  test('days left rounds up and never shows 0 on a valid link', () => {
    const now = Date.UTC(2026, 9, 14);
    assert.equal(daysLeft(now / 1000 + 86400 * 29.2, now), 30);
    assert.equal(daysLeft(now / 1000 + 60, now), 1);
    assert.equal(daysLeft(null, now), 0);
  });
});

describe('the policy pages say what the server does', () => {
  test('the numbers come from STORE, not from the text', () => {
    for (const lang of LOCALES) {
      const p = DICTS[lang].pages;
      const text = JSON.stringify([p['/refund-policy'], p['/delivery-policy']]);
      assert.ok(text.includes('{refundDays}') && text.includes('{downloadDays}') && text.includes('{maxDownloads}'), lang);
    }
    assert.ok(STORE.refundDays > 0 && STORE.downloadDays > 0 && STORE.maxDownloads > 0 && STORE.unpaidDays > 0);
  });

  test('every language has the new pages, the store words and the policy links', () => {
    for (const lang of LOCALES) {
      const d = DICTS[lang];
      for (const path of ['/store', '/refund-policy', '/delivery-policy', '/store/thanks']) assert.ok(d.pages[path], `${lang} ${path}`);
      assert.ok(PAGES.every((p) => d.pages[p.path]), `${lang}: a page has no text`);
      assert.match(d.pages['/terms'].body.join(''), /href="\/refund-policy"/);
      assert.match(d.pages['/privacy-policy'].body.join(''), /\{unpaidDays\}/);
      assert.match(d.pages['/contact'].body.join(''), /href="\/refund-policy"/);
    }
  });
});
