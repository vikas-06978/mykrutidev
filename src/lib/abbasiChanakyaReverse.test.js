import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert, unmappedChars } from './fontMaps.js';
import {
  ABBASI_CHANAKYA_REVERSE,
  ABBASI_CHANAKYA_TABLE,
  ONE_WAY,
  TESTS,
} from './abbasiChanakya.js';
import { getPage, isLive, isIndexable, allGroups, reversePage, SITE } from './routes.js';
import { previewFontFor } from './legacyFonts.js';

/** Unicode -> Abbasi Chanakya New. */
const toA = (s, opts) => convert(s, 'unicode', 'abbasi-chanakya', opts);
/** Abbasi Chanakya New -> Unicode (the existing, unchanged converter). */
const toU = (s, opts) => convert(s, 'abbasi-chanakya', 'unicode', opts);

// ---------------------------------------------------------------------------
// Round trip over the handoff's own words
// ---------------------------------------------------------------------------

describe('round trip: Unicode -> Abbasi -> Unicode, every JSON test word', () => {
  for (const { expected } of TESTS) {
    test(expected, () => {
      const legacy = toA(expected);
      assert.doesNotMatch(legacy, /[-]/, 'leaked a sentinel');
      assert.equal(toU(legacy), expected, `via ${legacy}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Exact outputs
// ---------------------------------------------------------------------------

describe('exact outputs', () => {
  const PAIRS = [
    ['हिन्दी', 'fgUnh'],
    ['राष्ट्र', 'jk"Vª'],
    ['कर्म', 'deZ'],
    ['ऊर्जा', 'ÅtkZ'],
    ['कीर्ति', 'dhfrZ'],
    ['र्की', 'dhZ'],
    ['स्थिति', 'fLFkfr'],
    ['ध', '/k'],
  ];
  for (const [uni, legacy] of PAIRS) {
    test(`${uni} -> ${legacy}`, () => assert.equal(toA(uni), legacy));
  }

  test('िं is the single Ç key before the cluster', () => {
    assert.equal(toA('सिंह'), 'Çlg');
    assert.equal(toU(toA('सिंह')), 'सिंह');
  });

  test('rakar is ª after ट ठ ड ढ छ and z elsewhere', () => {
    assert.equal(toA('ट्र'), 'Vª');
    assert.equal(toA('ड्र'), 'Mª');
    assert.equal(toA('छ्र'), 'Nª');
    assert.equal(toA('ग्र'), 'xz');
    assert.equal(toA('ह्र'), 'gz');
  });

  test('a dedicated conjunct glyph beats the generated spelling', () => {
    assert.equal(toA('क्र'), 'Ø');
    assert.equal(toA('प्र'), 'ç');
    assert.equal(toA('त्र'), '=');
    assert.equal(toA('श्र'), 'J');
  });

  test('a consonant with no half-form key is written key + ~', () => {
    assert.equal(toA('द्'), 'n~');
    assert.equal(toU(toA('ट्ब')), 'ट्ब');
  });

  test('ो and ौ are ks and kS', () => {
    assert.equal(toA('को'), 'dks');
    assert.equal(toA('कौ'), 'dkS');
  });

  test('a precomposed nukta letter is written like the decomposed one', () => {
    assert.equal(toA('क़'), 'd+'); // क़ as one codepoint
    assert.equal(toA('क़'), 'd+');
  });
});

// ---------------------------------------------------------------------------
// Every canonical key really is the letter it claims
// ---------------------------------------------------------------------------

describe('the canonical table', () => {
  test('every two-way entry converts back to exactly its Unicode', () => {
    for (const [uni, key] of Object.entries(ABBASI_CHANAKYA_REVERSE)) {
      if (uni in ONE_WAY) continue;
      // Compared as NFD: the JSON writes ऩ and ऱ precomposed (u+ -> U+0929),
      // which is the same letter as न + ़.
      assert.equal(
        toU(key, { keepEnglish: false }).normalize('NFD'),
        uni.normalize('NFD'),
        `${uni} -> ${key}`,
      );
    }
  });

  test('every single-key entry is a real entry in the JSON', () => {
    // Guards against a typo'd key that happens to decode to something close.
    for (const [uni, key] of Object.entries(ABBASI_CHANAKYA_REVERSE)) {
      if (uni in ONE_WAY || key.includes('~') || key.length > 2) continue;
      if (key in ABBASI_CHANAKYA_TABLE) {
        assert.equal(ABBASI_CHANAKYA_TABLE[key], uni, `${key} is ${ABBASI_CHANAKYA_TABLE[key]}, not ${uni}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Known one-way cases
// ---------------------------------------------------------------------------

describe('known one-way cases', () => {
  test('१२३ -> 123', () => assert.equal(toA('१२३'), '123'));
  test('ः -> %', () => assert.equal(toA('ः'), '%'));
  test('" -> **', () => assert.equal(toA('"'), '**'));
  test("' -> *", () => assert.equal(toA("'"), '*'));
});

// ---------------------------------------------------------------------------
// Passthrough and the unmapped warning
// ---------------------------------------------------------------------------

describe('what is left alone', () => {
  test('whitespace and newlines are preserved exactly', () => {
    assert.equal(toA('भारत  की\nराजधानी\r\n\tहै।'), 'Òkjr  dh\njkt/kkuh\r\n\tgSA');
  });

  test('English text passes through, as on the Unicode -> Kruti page', () => {
    assert.equal(toA('भारत PAN office'), 'Òkjr PAN office');
    assert.equal(
      toA('https://example.com 15/08/1947 भारत'),
      'https://example.com 15/08/1947 Òkjr',
    );
  });

  test('a character with no key is left unchanged and reported', () => {
    assert.equal(toA('ॐ ऌ क'), 'ॐ ऌ d');
    assert.deepEqual(unmappedChars('ॐ ऌ क', 'abbasi-chanakya').sort(), ['ऌ', 'ॐ'].sort());
  });

  test('ordinary text raises no warning', () => {
    for (const { expected } of TESTS) {
      assert.deepEqual(unmappedChars(expected, 'abbasi-chanakya'), [], expected);
    }
    assert.deepEqual(unmappedChars('Hello 2024! भारत', 'abbasi-chanakya'), []);
    assert.deepEqual(unmappedChars('१२३ ः " \'', 'abbasi-chanakya'), []);
  });

  test('the warning is Abbasi-only: Kruti Dev pages never show it', () => {
    assert.deepEqual(unmappedChars('ॐ', 'kruti-dev'), []);
  });
});

// ---------------------------------------------------------------------------
// Page, nav, sitemap
// ---------------------------------------------------------------------------

describe('the page', () => {
  const page = getPage('/unicode-to-abbasi-chanakya');

  test('is live, indexed, Beta, and listed under Chanakya on All tools', () => {
    assert.ok(isLive(page));
    assert.ok(isIndexable(new URL(page.path, SITE).href));
    assert.equal(page.beta, true);
    const chanakya = allGroups().find((g) => g.name === 'Chanakya');
    const live = chanakya.pages.filter((p) => p.live).map((p) => p.path);
    for (const p of ['/abbasi-chanakya-to-unicode', '/unicode-to-abbasi-chanakya']) assert.ok(live.includes(p), p);
    // Everything live under "Chanakya" is Abbasi, the newspaper Chanakya font
    // or Patrika: the Walkman-Chanakya map has no live page anywhere.
    const family = ['abbasi-chanakya', 'chanakya-news', 'patrika'];
    for (const p of live) {
      const { from, to } = getPage(p);
      assert.ok(family.includes(from) || family.includes(to), p);
      assert.ok(from !== 'chanakya' && to !== 'chanakya', p);
    }
    // The Walkman-Chanakya pairs were removed, not left "coming soon".
    assert.ok(!chanakya.pages.some((p) => p.path === '/chanakya-to-kruti-dev'));
  });

  test('the two Abbasi pages link to each other', () => {
    assert.equal(reversePage(page).path, '/abbasi-chanakya-to-unicode');
    assert.equal(reversePage(getPage('/abbasi-chanakya-to-unicode')).path, page.path);
    assert.ok(page.related.includes('/abbasi-chanakya-to-unicode'));
    assert.ok(getPage('/abbasi-chanakya-to-unicode').related.includes(page.path));
  });

  test('the output previews in the Abbasi woff', () => {
    assert.equal(previewFontFor('abbasi-chanakya').file, 'abbasi-chanakya-new.woff');
    assert.equal(FONTS['abbasi-chanakya'].warnUnmapped, true);
  });
});
