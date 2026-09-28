import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BROWSERS,
  CONTEXT_FIELDS,
  LIMITS,
  SCHEMA,
  USED,
  USED_BY_PAGE,
  WANTS,
  browserName,
  csvCell,
  toCsv,
  toRow,
  validateFeedback,
  validateToolRequest,
  toRequestRow,
  REQUEST_LIMITS,
} from './feedback.js';
import { PAGES } from './routes.js';
import en from '../i18n/en.json' with { type: 'json' };
import hi from '../i18n/hi.json' with { type: 'json' };

const ctx = { page: '/', lang: 'en', theme: 'light', device: 'desktop', width: 1366, browser: 'Chrome' };
const valid = { rating: 3, used: ['kruti-dev'], wants: ['design'], ...ctx };

const errorsOf = (input) => {
  const r = validateFeedback(input);
  assert.equal(r.ok, false, `expected ${JSON.stringify(input)} to be rejected`);
  return r.errors.join('\n');
};

describe('validateFeedback', () => {
  test('a minimal submission - a rating and the context - is accepted', () => {
    const r = validateFeedback({ rating: 1, ...ctx });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.used, []);
    assert.equal(r.value.message, '');
  });

  test('every option and field at its limit is accepted', () => {
    const r = validateFeedback({
      ...ctx,
      rating: 4,
      used: [...USED],
      wants: [...WANTS],
      bugText: 'क'.repeat(LIMITS.bugText),
      message: 'ख'.repeat(LIMITS.message),
      email: 'Someone@Example.co.in',
      page: '/hi/hindi-keyboard',
      lang: 'hi',
      theme: 'contrast',
      device: 'mobile',
      width: 390,
      browser: 'Samsung',
    });
    assert.equal(r.ok, true, r.errors?.join('\n'));
    assert.equal(r.value.email, 'someone@example.co.in');
  });

  test('picks are de-duplicated and stored in the canonical order', () => {
    const r = validateFeedback({ ...valid, wants: ['bug', 'more-fonts', 'bug'] });
    assert.deepEqual(r.value.wants, ['more-fonts', 'bug']);
  });

  test('bugText is dropped unless "Something is wrong" was picked', () => {
    assert.equal(validateFeedback({ ...valid, bugText: 'broken' }).value.bugText, '');
    assert.equal(validateFeedback({ ...valid, wants: ['bug'], bugText: ' broken ' }).value.bugText, 'broken');
  });

  test('rejects a missing or out-of-range rating', () => {
    for (const rating of [undefined, 0, 5, 2.5, '3', null]) {
      assert.match(errorsOf({ ...valid, rating }), /rating/);
    }
  });

  test('rejects options that do not exist, and lists that are not lists', () => {
    assert.match(errorsOf({ ...valid, used: ['photoshop'] }), /used: unknown option/);
    assert.match(errorsOf({ ...valid, wants: 'bug' }), /wants: not a list/);
    assert.match(errorsOf({ ...valid, wants: [{}] }), /wants: unknown option/);
  });

  test('rejects text over the limit, non-text and control characters', () => {
    assert.match(errorsOf({ ...valid, message: 'x'.repeat(LIMITS.message + 1) }), /message: longer/);
    assert.match(errorsOf({ ...valid, wants: ['bug'], bugText: 'x'.repeat(LIMITS.bugText + 1) }), /bugText: longer/);
    assert.match(errorsOf({ ...valid, message: 42 }), /message: not text/);
    assert.match(errorsOf({ ...valid, message: 'a\u0000b' }), /control characters/);
  });

  test('rejects a malformed email', () => {
    for (const email of ['nope', 'a@b', 'a b@c.com', '<x>@y.com']) {
      assert.match(errorsOf({ ...valid, email }), /email/, email);
    }
  });

  test('rejects bad context', () => {
    assert.match(errorsOf({ ...valid, page: 'https://evil.example/' }), /page/);
    assert.match(errorsOf({ ...valid, page: '/x?text=secret' }), /page/);
    assert.match(errorsOf({ ...valid, lang: 'fr' }), /lang/);
    assert.match(errorsOf({ ...valid, theme: 'neon' }), /theme/);
    assert.match(errorsOf({ ...valid, device: 'tv' }), /device/);
    assert.match(errorsOf({ ...valid, width: -1 }), /width/);
    assert.match(errorsOf({ ...valid, width: '390' }), /width/);
    assert.match(errorsOf({ ...valid, browser: 'Mozilla/5.0 (Windows NT 10.0)' }), /browser/);
  });

  test('rejects fields it does not know - tool text can never ride along', () => {
    assert.match(errorsOf({ ...valid, input: 'fgUnh' }), /input: unknown field/);
    assert.match(errorsOf({ ...valid, userAgent: 'Mozilla/5.0' }), /userAgent: unknown field/);
    assert.match(errorsOf({ ...valid, ip: '1.2.3.4' }), /ip: unknown field/);
  });

  test('rejects things that are not objects', () => {
    for (const body of [null, [], 'hi', 3]) assert.equal(validateFeedback(body).ok, false);
  });
});

describe('browserName', () => {
  const UA = {
    Chrome:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    Edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    Samsung:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
    Firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    Safari:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    Opera:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0',
  };
  for (const [name, ua] of Object.entries(UA)) {
    test(name, () => assert.equal(browserName(ua), name));
  }
  test('anything else is "Other", and every answer is one the server accepts', () => {
    assert.equal(browserName('curl/8.0'), 'Other');
    for (const ua of [...Object.values(UA), '', 'x']) assert.ok(BROWSERS.includes(browserName(ua)));
  });
});

describe('storage', () => {
  test('db/feedback.sql holds exactly the SCHEMA statements', () => {
    const sql = readFileSync(new URL('../../db/feedback.sql', import.meta.url), 'utf8');
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    assert.deepEqual(statements, SCHEMA.map((s) => s.replace(/\s+/g, ' ').trim()));
  });

  test('toRow stores lists as JSON and empty text as NULL', () => {
    const row = toRow(validateFeedback({ ...valid, wants: ['bug', 'design'] }).value);
    assert.equal(row.wants, '["design","bug"]');
    assert.equal(row.message, null);
    assert.equal(row.email, null);
    for (const f of CONTEXT_FIELDS) assert.ok(f in row, f);
  });
});

describe('CSV', () => {
  test('quotes commas, quotes and newlines', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('two\nlines'), '"two\nlines"');
    assert.equal(csvCell(null), '');
  });

  test('defuses spreadsheet formulas', () => {
    for (const s of ['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)']) assert.ok(csvCell(s).replace(/^"/, '').startsWith("'"), s);
  });

  test('starts with a BOM and a header row, one line per record', () => {
    const csv = toCsv([{ id: 1, message: 'नमस्ते' }], ['id', 'message']);
    assert.ok(csv.startsWith('﻿id,message\r\n'));
    assert.equal(csv, '﻿id,message\r\n1,नमस्ते\r\n');
  });
});

describe('the words for every option', () => {
  test('every option id has a label in both languages, and nothing else does', () => {
    for (const dict of [en, hi]) {
      assert.deepEqual(Object.keys(dict.feedback.used), USED);
      assert.deepEqual(Object.keys(dict.feedback.wants), WANTS);
      assert.deepEqual(Object.keys(dict.feedback.ratings), ['1', '2', '3', '4']);
    }
  });

  test('the button says "Feedback" in English and "सुझाव" in Hindi', () => {
    assert.equal(en.feedback.button, 'Feedback');
    assert.equal(hi.feedback.button, 'सुझाव');
  });

  test('USED_BY_PAGE points at real pages and real options', () => {
    const paths = new Set(PAGES.map((p) => p.path));
    for (const [path, id] of Object.entries(USED_BY_PAGE)) {
      assert.ok(paths.has(path), path);
      assert.ok(USED.includes(id), id);
    }
  });
});

describe('validateToolRequest', () => {
  const ok = { idea: 'PDF to Kruti Dev', lang: 'en', device: 'desktop' };

  test('accepts an idea alone, and trims it', () => {
    const r = validateToolRequest({ ...ok, idea: '  PDF to Kruti Dev  ' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { idea: 'PDF to Kruti Dev', details: '', email: '', lang: 'en', device: 'desktop' });
    assert.deepEqual(toRequestRow(r.value), { idea: 'PDF to Kruti Dev', details: null, email: null, lang: 'en', device: 'desktop' });
  });

  test('counts Devanagari in characters, as the form does', () => {
    assert.equal(validateToolRequest({ ...ok, idea: 'क'.repeat(REQUEST_LIMITS.idea) }).ok, true);
    assert.equal(validateToolRequest({ ...ok, idea: 'क'.repeat(REQUEST_LIMITS.idea + 1) }).ok, false);
    assert.equal(validateToolRequest({ ...ok, idea: 'कि' }).ok, false, 'two characters is too short');
  });

  test('refuses anything the form does not send', () => {
    for (const bad of [
      null,
      [],
      { ...ok, idea: '' },
      { ...ok, idea: 42 },
      { ...ok, details: 'x'.repeat(REQUEST_LIMITS.details + 1) },
      { ...ok, email: 'nope' },
      { ...ok, lang: 'fr' },
      { ...ok, device: 'tv' },
      { ...ok, page: '/links' },
      { ...ok, idea: 'bad\u0000text' },
    ]) {
      assert.equal(validateToolRequest(bad).ok, false, JSON.stringify(bad));
    }
  });
});
