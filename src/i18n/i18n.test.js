import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DICTS,
  LOCALES,
  t,
  raw,
  fill,
  flatKeys,
  keyDiff,
  assertParity,
  splitLocale,
  localizePath,
  localizeHtml,
  markNoTranslate,
} from './index.js';
import { localizeDocMessage, localizeSummary, TOO_LARGE_EN, ONLY_TYPES_EN } from './docMessages.js';
import { PAGES, getPage, isIndexable, routeOf, SITE } from '../lib/routes.js';
import { FONTS, boxLabel } from '../lib/fontMaps.js';
import { LEVELS } from '../lib/lessons.js';
import { FINGERS } from '../lib/remington.js';
import { HANDS } from '../lib/hands.js';
import { DURATIONS } from '../lib/passages.js';
import { MODES } from '../lib/translit.js';
import * as docConvert from '../lib/docConvert.js';

const { en, hi } = DICTS;
const RE_DEVA = /[ऀ-ॿ]/;

// ---------------------------------------------------------------------------
// The two dictionaries hold the same keys
// ---------------------------------------------------------------------------

describe('en.json and hi.json', () => {
  test('have exactly the same keys, both ways', () => {
    const { onlyInFirst, onlyInSecond } = keyDiff(en, hi);
    assert.deepEqual(onlyInFirst, [], `missing in hi.json: ${onlyInFirst.join(', ')}`);
    assert.deepEqual(onlyInSecond, [], `missing in en.json: ${onlyInSecond.join(', ')}`);
  });

  test('every value is a string (no nulls, numbers or empty objects smuggled in)', () => {
    for (const lang of LOCALES) {
      for (const key of flatKeys(DICTS[lang])) {
        assert.equal(typeof raw(lang, key), 'string', `${lang}: ${key}`);
      }
    }
  });

  test('no Hindi value is left empty except where the English is empty too', () => {
    // translit.suggestBefore is legitimately "" in Hindi: the word order puts
    // the code first ("<code> की दूसरी स्पेलिंग:").
    const allowedEmpty = new Set(['translit.suggestBefore']);
    for (const key of flatKeys(hi)) {
      if (allowedEmpty.has(key)) continue;
      assert.ok(raw('hi', key).trim() || !raw('en', key).trim(), `hi.json: ${key} is empty`);
    }
  });

  test('the parity guard that runs at import time fires on a missing key', () => {
    // index.js calls assertParity() on load, so the build dies on a gap. Prove
    // the guard fires rather than trusting that it would.
    assert.throws(() => assertParity({ a: '1', b: '2' }, { a: '1' }), /missing in hi\.json: b/);
    assert.throws(() => assertParity({ a: '1' }, { a: '1', c: '3' }), /missing in en\.json: c/);
    assert.doesNotThrow(() => assertParity(en, hi));
  });

  test('every {placeholder} in English exists in the Hindi, and vice versa', () => {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of flatKeys(en)) {
      assert.deepEqual(vars(raw('hi', key)), vars(raw('en', key)), key);
    }
  });

  test('t() throws on a missing key rather than falling back to English', () => {
    assert.throws(() => t('hi', 'no.such.key'), /missing key "no\.such\.key" in hi\.json/);
    assert.throws(() => t('en', 'pages./no-such-page.h1'), /missing key/);
    assert.throws(() => t('xx', 'nav.menu'), /unknown locale/);
  });

  test('fill() leaves an unknown placeholder visible instead of blanking it', () => {
    assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
  });
});

// ---------------------------------------------------------------------------
// What must NOT be translated
// ---------------------------------------------------------------------------

describe('code examples and Unicode output survive translation untouched', () => {
  /** The contents of every <code> and every lang="hi" element in a string. */
  const codes = (s) => [...s.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((m) => m[1]).sort();
  const deva = (s) =>
    [...s.matchAll(/<(span|strong)[^>]*\blang="(?:hi|mr)"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).sort();
  const hrefs = (s) => [...s.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).sort();

  test('every <code> example is identical in English and Hindi', () => {
    for (const key of flatKeys(en)) {
      assert.deepEqual(codes(raw('hi', key)), codes(raw('en', key)), key);
    }
  });

  test('no Devanagari inside a <code> example, in either language', () => {
    // Code examples are legacy-font keystrokes (fgUnh, deZ) or Roman input.
    // Intended Unicode output is always marked lang="hi" instead.
    for (const lang of LOCALES) {
      for (const key of flatKeys(DICTS[lang])) {
        for (const c of codes(raw(lang, key))) {
          assert.doesNotMatch(c, RE_DEVA, `${lang}: ${key} has Devanagari in <code>${c}</code>`);
        }
      }
    }
  });

  test('every lang="hi" Unicode sample is identical in English and Hindi', () => {
    for (const key of flatKeys(en)) {
      assert.deepEqual(deva(raw('hi', key)), deva(raw('en', key)), key);
    }
  });

  test('every link points at the same pages in both languages', () => {
    for (const key of flatKeys(en)) {
      assert.deepEqual(hrefs(raw('hi', key)), hrefs(raw('en', key)), key);
    }
  });

  test('font names the reader must pick in Word stay in Latin in the Hindi', () => {
    // Wherever the English tells someone to set a font, the Hindi must name
    // the same font, spelled the same way - that is what they will search for
    // in Word's font list.
    const PICK = ['Kruti Dev 010', 'DevLys 010', 'Abbasi Chanakya New', 'Mangal'];
    for (const key of flatKeys(en)) {
      for (const name of PICK) {
        const inEn = raw('en', key).split(name).length - 1;
        if (inEn === 0) continue;
        assert.ok(raw('hi', key).includes(name), `${key}: Hindi lost "${name}"`);
      }
    }
  });

  test('the brand and file types are never translated', () => {
    for (const key of flatKeys(en)) {
      for (const name of ['MyKrutiDev', '.docx', '.txt']) {
        if (raw('en', key).includes(name)) {
          assert.ok(raw('hi', key).includes(name), `${key}: Hindi lost "${name}"`);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The English column must still say what the code says
// ---------------------------------------------------------------------------

describe('English copy that mirrors a lib file has not drifted from it', () => {
  test('box labels match boxLabel()', () => {
    for (const key of Object.keys(FONTS)) assert.equal(en.fontBox[key], boxLabel(key), key);
    assert.deepEqual(Object.keys(en.fontBox).sort(), Object.keys(FONTS).sort());
  });

  test('lesson names, titles and focus lines match lessons.js', () => {
    for (const l of LEVELS) {
      assert.equal(en.tutor.levels[l.id].name, l.name, l.id);
      assert.equal(en.tutor.levels[l.id].title, l.title, l.id);
      assert.equal(en.tutor.levels[l.id].focus, l.focus, l.id);
    }
    assert.equal(Object.keys(en.tutor.levels).length, LEVELS.length);
  });

  test('finger and hand names match remington.js and hands.js', () => {
    for (const f of FINGERS) assert.equal(en.tutor.fingers[f.id], f.name, f.id);
    for (const h of HANDS) assert.equal(en.tutor.hands[h.id], h.label, h.id);
  });

  test('test lengths match passages.js', () => {
    for (const d of DURATIONS) assert.equal(en.tutor.durations[d.value], d.label, String(d.value));
    assert.equal(Object.keys(en.tutor.durations).length, DURATIONS.length);
  });

  test('typing modes match translit.js', () => {
    for (const m of Object.values(MODES)) {
      assert.equal(en.translit.modes[m.key].label, m.label, m.key);
      assert.equal(en.translit.modes[m.key].hint, m.hint, m.key);
    }
  });

  test('every page in routes.js has its text in both languages', () => {
    for (const p of PAGES) {
      for (const lang of LOCALES) {
        for (const f of ['nav', 'h1', 'title', 'description']) {
          assert.ok(t(lang, `pages.${p.path}.${f}`), `${lang}: ${p.path}.${f}`);
        }
        if (p.path !== '/all-converters') assert.ok(t(lang, `pages.${p.path}.lede`));
      }
      // routes.js reads its English copy from en.json.
      assert.equal(p.h1, en.pages[p.path].h1);
    }
    assert.deepEqual(Object.keys(en.pages).sort(), PAGES.map((p) => p.path).sort());
  });

  test('every Hindi page has a Hindi <title> and description', () => {
    for (const p of PAGES) {
      assert.match(t('hi', `pages.${p.path}.title`), RE_DEVA, `${p.path} title`);
      assert.match(t('hi', `pages.${p.path}.description`), RE_DEVA, `${p.path} description`);
    }
  });
});

// ---------------------------------------------------------------------------
// Document upload messages
// ---------------------------------------------------------------------------

describe('document messages', () => {
  const L = { en: en.doc, hi: hi.doc };

  test('the English wording is exactly what docConvert.js says, for every summary shape', () => {
    const cases = [];
    for (const paragraphs of [0, 1, 2, 1234]) {
      for (const tables of [0, 1, 3]) {
        for (const [convertedChars, alreadyChars] of [[0, 0], [0, 50], [80, 0], [997, 3], [1, 999], [50, 50]]) {
          cases.push({ paragraphs, tables, convertedChars, alreadyChars });
        }
      }
    }
    for (const stats of cases) {
      for (const dir of ['to-unicode', 'to-kruti']) {
        assert.deepEqual(localizeSummary(stats, dir, L.en), docConvert.summarize(stats, dir), JSON.stringify({ stats, dir }));
      }
    }
  });

  test('every error checkFile() can return is recognised, and English passes through unchanged', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
    const junk = new Uint8Array([1, 2, 3, 4]);
    const outcomes = [
      docConvert.checkFile({ name: 'a.doc', size: 10 }),
      docConvert.checkFile({ name: 'a.docx', size: 10, head: pdf }),
      docConvert.checkFile({ name: 'a.docx', size: 10, head: ole }),
      docConvert.checkFile({ name: 'a.docx', size: 10, head: junk }),
      docConvert.checkFile({ name: 'a.docx', size: 100 * 1024 * 1024 }),
      docConvert.checkFile({ name: 'a.xlsx', size: 10 }),
    ];
    const errors = outcomes.map((o) => o.error);
    assert.ok(errors.every(Boolean));
    assert.ok(errors.includes(TOO_LARGE_EN), 'TOO_LARGE_EN drifted from docConvert.js');
    assert.ok(errors.includes(ONLY_TYPES_EN), 'ONLY_TYPES_EN drifted from docConvert.js');

    for (const msg of [...errors, docConvert.DAMAGED_MESSAGE, docConvert.GENERIC_MESSAGE]) {
      assert.equal(localizeDocMessage(msg, docConvert, L.en), msg, 'English must be unchanged');
      const inHindi = localizeDocMessage(msg, docConvert, L.hi);
      assert.notEqual(inHindi, msg, `not translated: ${msg}`);
      assert.match(inHindi, RE_DEVA, `not Hindi: ${inHindi}`);
    }
  });

  test('a message it does not know yet is shown as-is rather than lost', () => {
    assert.equal(localizeDocMessage('Some new problem.', docConvert, L.hi), 'Some new problem.');
  });

  test('the Hindi summary uses the same numbers', () => {
    const s = localizeSummary({ paragraphs: 12, tables: 2, convertedChars: 997, alreadyChars: 3 }, 'to-unicode', L.hi);
    assert.equal(s.line, '12 पैराग्राफ़ बदले गए · 2 टेबल');
    assert.match(s.share, /^हिंदी टेक्स्ट का 99% हिस्सा कृतिदेव में था/);
    assert.match(s.share, /1% पहले से यूनिकोड में था/);
  });
});

// ---------------------------------------------------------------------------
// Paths and links
// ---------------------------------------------------------------------------

describe('paths', () => {
  test('splitLocale reads the language from the URL', () => {
    assert.deepEqual(splitLocale('/'), { lang: 'en', path: '/' });
    assert.deepEqual(splitLocale('/hindi-keyboard/'), { lang: 'en', path: '/hindi-keyboard' });
    assert.deepEqual(splitLocale('/hi'), { lang: 'hi', path: '/' });
    assert.deepEqual(splitLocale('/hi/'), { lang: 'hi', path: '/' });
    assert.deepEqual(splitLocale('/hi/hindi-keyboard/'), { lang: 'hi', path: '/hindi-keyboard' });
    // A slug that merely starts with "hi" is English.
    assert.deepEqual(splitLocale('/hindi-typing-test'), { lang: 'en', path: '/hindi-typing-test' });
  });

  test('localizePath gives the same page in the other language', () => {
    assert.equal(localizePath('/', 'hi'), '/hi');
    assert.equal(localizePath('/unicode-to-kruti-dev', 'hi'), '/hi/unicode-to-kruti-dev');
    assert.equal(localizePath('/hi/unicode-to-kruti-dev', 'en'), '/unicode-to-kruti-dev');
    assert.equal(localizePath('/hi', 'en'), '/');
  });

  test('every Hindi route maps back to a real page', () => {
    for (const p of PAGES) {
      assert.equal(routeOf(localizePath(p.path, 'hi')), p.path);
      assert.ok(getPage(splitLocale(localizePath(p.path, 'hi')).path));
    }
  });

  test('the sitemap filter treats /hi pages exactly like their English twins', () => {
    for (const p of PAGES) {
      assert.equal(
        isIndexable(new URL(localizePath(p.path, 'hi'), SITE).href),
        isIndexable(new URL(p.path, SITE).href),
        p.path,
      );
    }
  });

  test('localizeHtml moves page links to /hi and leaves everything else alone', () => {
    const html =
      '<a href="/">a</a> <a href="/x#faq">b</a> <a href="/hi/y">c</a> <a href="https://e.com/">d</a>' +
      ' <a href="/data/english-words.json">e</a> <a href="/" data-lang-switch="en">f</a> <link href="/favicon.svg">';
    assert.equal(
      localizeHtml(html, 'hi'),
      '<a href="/hi">a</a> <a href="/hi/x#faq">b</a> <a href="/hi/y">c</a> <a href="https://e.com/">d</a>' +
        ' <a href="/data/english-words.json">e</a> <a href="/" data-lang-switch="en">f</a> <link href="/favicon.svg">',
    );
    assert.equal(localizeHtml(html, 'en'), html);
  });

  test('markNoTranslate protects codes and font names, and never touches attributes', () => {
    assert.equal(
      markNoTranslate('Set <strong>Kruti Dev 010</strong>, type <code>fgUnh</code>'),
      'Set <strong><span translate="no">Kruti Dev 010</span></strong>, type <code translate="no">fgUnh</code>',
    );
    // "Kruti Dev" inside the longer name is not wrapped twice.
    assert.equal(markNoTranslate('Kruti Dev 010'), '<span translate="no">Kruti Dev 010</span>');
    // Attribute values are left as they are.
    assert.equal(markNoTranslate('<a title="Mangal">x</a>'), '<a title="Mangal">x</a>');
    // Nothing inside <code> is wrapped again.
    assert.equal(markNoTranslate('<code>.docx</code>'), '<code translate="no">.docx</code>');
  });
});
