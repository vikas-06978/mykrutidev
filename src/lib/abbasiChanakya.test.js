import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { FONTS, convert, isAccurate } from './fontMaps.js';
import { ABBASI_CHANAKYA_TABLE, EXCLUDED, TESTS } from './abbasiChanakya.js';
import { getPage, isLive, isIndexable, allGroups, SITE } from './routes.js';
import { previewFontFor } from './legacyFonts.js';

/** Abbasi Chanakya New -> Unicode. */
const toU = (s, opts) => convert(s, 'abbasi-chanakya', 'unicode', opts);

// ---------------------------------------------------------------------------
// Ground truth: the handoff's own words
// ---------------------------------------------------------------------------

describe('the handoff test words', () => {
  // Each expected value was produced by the reference converter and checked by
  // eye against the font drawing (abbasi-chanakya-verification.html).
  test('there are 40 of them', () => assert.equal(TESTS.length, 40));

  for (const { input, expected } of TESTS) {
    test(`${input} -> ${expected}`, () => assert.equal(toU(input), expected));
  }
});

// ---------------------------------------------------------------------------
// The rules from the handoff, each pinned on its own
// ---------------------------------------------------------------------------

describe('reorder rules', () => {
  test('f (ि) moves after the whole cluster, halant chain included', () => {
    assert.equal(toU('fLFkfr'), 'स्थिति');
    assert.equal(toU('fp='), 'चित्र');
  });

  test('Ç (िं) moves after the cluster with the anusvara after it', () => {
    assert.equal(toU('Çlg'), 'सिंह');
  });

  test('Z moves र् to the start of the syllable, over a trailing matra', () => {
    assert.equal(toU('deZ'), 'कर्म');
    assert.equal(toU('vk\'khokZn'), 'आशीर्वाद');
  });

  test('± Æ É Ê emit their sign and move र् in front', () => {
    assert.equal(toU('d±'), 'र्कं');
    assert.equal(toU('dÆ'), 'र्कि');
    assert.equal(toU('dÉ'), 'र्किं');
    assert.equal(toU('dÊ'), 'र्की');
  });

  test('the ि from Æ stays put even when a letter follows it', () => {
    // A pre-base ि would hop over the next cluster. This one was typed where
    // it belongs, so it must not.
    assert.equal(toU('dhrÆdk'), 'कीर्तिका');
  });

  test('=k gives त्रा, not त्र', () => {
    // The old Chanakya table had "=k" -> "त्र". In this font = is already a
    // full त्र, so k is its aa-matra.
    assert.equal(toU('=k'), 'त्रा');
    assert.equal(toU('='), 'त्र');
  });
});

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

describe('what is left alone', () => {
  test('whitespace and newlines are preserved exactly', () => {
    assert.equal(toU('Hkkjr  dh\njkt/kkuh\r\n\tgSA'), 'भारत  की\nराजधानी\r\n\tहै।');
    assert.equal(toU('  '), '  ');
  });

  test('English inside Hindi passes through', () => {
    assert.equal(toU('Hkkjr PAN dh office'), 'भारत PAN की office');
    assert.equal(toU('https://example.com Hkkjr'), 'https://example.com भारत');
  });

  test('digits 0-9 pass through: the font has no Hindi digit keys', () => {
    assert.equal(toU('0123456789'), '0123456789');
    assert.equal(toU('fnYyh 2024'), 'दिल्ली 2024');
    assert.equal(toU('15/08/1947'), '15/08/1947', 'a date is protected whole');
    // Even with English-keeping off, nothing maps a digit. (The / in a date
    // would convert then - it is the ध् key - but the digits never do.)
    assert.equal(toU('d 0123456789', { keepEnglish: false }), 'क 0123456789');
  });

  test('excluded keys stay unchanged', () => {
    assert.deepEqual(Object.keys(EXCLUDED).sort(), ['¤', '§', 'Ú', 'ö'].sort());
    for (const key of Object.keys(EXCLUDED)) {
      assert.equal(toU(key), key, `${key} alone`);
      assert.equal(toU(`d${key}`), `क${key}`, `${key} after a letter`);
      assert.ok(!(key in ABBASI_CHANAKYA_TABLE), `${key} must not be in the table`);
    }
  });

  test('only standalone Ú is excluded: Úk is न', () => {
    assert.equal(toU('Úk'), 'न');
  });

  test('no private-use sentinel ever reaches the output', () => {
    for (const s of ['Z', 'Ç', 'Æ', 'É', '±', 'Ê', 'dhrÆdk', 'Çlg', ...TESTS.map((t) => t.input)]) {
      assert.doesNotMatch(toU(s), /[-]/, `${s} leaked a sentinel`);
    }
  });
});

// ---------------------------------------------------------------------------
// The table is the JSON, and only the JSON
// ---------------------------------------------------------------------------

describe('the table', () => {
  const json = JSON.parse(
    readFileSync(
      new URL('../../vendor/fonts/Abbasi Chanakya New/abbasi-chanakya-mapping.json', import.meta.url),
      'utf8',
    ),
  );

  test('is exactly multi + single, nothing added or changed', () => {
    const expected = Object.fromEntries([...json.multi, ...json.single].map((e) => [e.from, e.to]));
    assert.deepEqual(ABBASI_CHANAKYA_TABLE, expected);
  });

  test('does not carry the old Chanakya entries the handoff lists as wrong', () => {
    for (const key of ['iQ', 'IkQ', 'mQ', 'jQ', 'oQ', '=k', 'Â', 'ƒ', '„', '…', '†']) {
      assert.ok(!(key in ABBASI_CHANAKYA_TABLE), `${key} should not be mapped`);
    }
    assert.equal(ABBASI_CHANAKYA_TABLE.Q, 'फ');
    assert.equal(ABBASI_CHANAKYA_TABLE['Ü'], 'श');
    assert.equal(ABBASI_CHANAKYA_TABLE._, 'ऋ');
    assert.equal(ABBASI_CHANAKYA_TABLE['½'], ')');
  });

  test('is a different object from the Walkman-style chanakya map', () => {
    assert.notEqual(FONTS['abbasi-chanakya'].map, FONTS.chanakya.map);
  });

  test('the registry sample decodes to real Hindi', () => {
    assert.equal(toU(FONTS['abbasi-chanakya'].sample), 'हिन्दी भारत की राजधानी भाषा है।');
  });
});

// ---------------------------------------------------------------------------
// Page, font and isolation
// ---------------------------------------------------------------------------

describe('the page', () => {
  const page = getPage('/abbasi-chanakya-to-unicode');

  test('is live, in the sitemap and on All tools, with a Beta badge', () => {
    assert.ok(isLive(page));
    assert.ok(isIndexable(new URL(page.path, SITE).href));
    assert.ok(
      allGroups().some((g) => g.pages.some((p) => p.path === page.path && p.live)),
      'not listed on All tools',
    );
    assert.equal(page.beta, true);
    assert.equal(page.betaNote, 'For text typed in the Abbasi Chanakya New font.');
  });

  test('Walkman-Chanakya has no live page: /chanakya-to-unicode is the newspaper font', () => {
    assert.equal(isAccurate('chanakya'), false);
    for (const path of ['/chanakya-to-unicode', '/unicode-to-chanakya']) {
      const page = getPage(path);
      assert.ok(page.from === 'chanakya-news' || page.to === 'chanakya-news', path);
    }
    for (const path of ['/chanakya-to-kruti-dev', '/kruti-dev-to-chanakya']) assert.equal(getPage(path), undefined, path);
  });

  test('previews in the Abbasi woff, never the old Chanakya file', () => {
    const f = previewFontFor('abbasi-chanakya');
    assert.equal(f.file, 'abbasi-chanakya-new.woff');
    assert.equal(f.format, 'woff');
    // The INPUT box shows raw code in plain monospace, like the Kruti page.
    assert.equal(FONTS['abbasi-chanakya'].css, 'monospace');
    // Exact, lowercase name on disk: hosts serve case-sensitively.
    assert.ok(readdirSync(new URL('../../public/fonts/', import.meta.url)).includes('abbasi-chanakya-new.woff'));
  });

  test('nothing in src/ imports the reference .py files', () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : [new URL(d.name, dir)],
      );
    for (const file of walk(new URL('../', import.meta.url))) {
      if (!/\.(js|ts|astro|mjs)$/.test(file.pathname)) continue;
      if (file.pathname.endsWith('abbasiChanakya.test.js')) continue;
      assert.doesNotMatch(readFileSync(file, 'utf8'), /\.py['"]/, `${file.pathname} references a .py file`);
    }
  });
});
