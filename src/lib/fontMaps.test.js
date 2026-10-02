import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  convert,
  legacyToUnicode,
  unicodeToLegacy,
  isWellFormedDevanagari,
  buildReverse,
  FONTS,
  isPairUnavailable,
  isPairAccurate,
  boxLabel,
  codeLabel,
  describeMismatch,
  DEVLYS_DIVERGENT_RANGE,
} from './fontMaps.js';

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/kruti-dev.json', import.meta.url)), 'utf8'),
);

const KD = FONTS['kruti-dev'].map;
const groups = Object.entries(fixtures).filter(([name]) => !name.startsWith('_'));

describe('kruti-dev -> unicode', () => {
  for (const [group, cases] of groups) {
    for (const { k, u, why } of cases) {
      test(`${group}: ${k} -> ${u}  (${why})`, () => {
        assert.equal(legacyToUnicode(k, KD), u);
      });
    }
  }
});

describe('unicode -> kruti-dev -> unicode round trip', () => {
  for (const [group, cases] of groups) {
    if (group === 'english_safe') continue; // asymmetric by design
    for (const { k, u, rt, why } of cases) {
      if (rt === false) continue;
      test(`${group}: ${u} survives a round trip (${why})`, () => {
        const back = unicodeToLegacy(u, KD);
        assert.equal(
          legacyToUnicode(back, KD),
          u,
          `went out as ${JSON.stringify(back)}`,
        );
      });
    }
  }
});

/**
 * Real Kruti Dev words for the keys the font draws as letters: `)` द्ध,
 * `}` द्व, `#` रु, `:` रू, `G` ळ. Each glyph was checked by rendering the word
 * in public/fonts/KRDEV010.woff. (`jQi;k` is NOT here: the font draws it as
 * रफपया - Q is फ - so it is a typo for jqi;k, not another spelling.)
 */
describe('kruti-dev letters on punctuation keys: real words', () => {
  const WORDS = [
    ["'kq)", 'शुद्ध'],
    ['i)fr', 'पद्धति'],
    ['fo}ku', 'विद्वान'],
    ['#i;k', 'रुपया'],
    ['jqi;k', 'रुपया'],
    [':i', 'रूप'],
    ['jwi', 'रूप'],
    ['vkS"k/k', 'औषध'],
    ['G', 'ळ'],
    ['deG', 'कमळ'],
  ];
  for (const [k, u] of WORDS) {
    test(`${k} -> ${u}`, () => assert.equal(legacyToUnicode(k, KD), u));
  }

  // Unicode -> Kruti Dev writes the key the font draws, and reads back the same.
  const REVERSE = [
    ['शुद्ध', "'kq)"],
    ['पद्धति', 'i)fr'],
    ['विद्वान', 'fo}ku'],
    ['द्वारा', '}kjk'],
    ['कमळ', 'deG'],
    ['रुपया', 'jqi;k'], // रु/रू keep the spelled-out keys the typing tutor teaches
    ['रूप', 'jwi'],
    ['औषध', 'vkS"k/k'],
  ];
  for (const [u, k] of REVERSE) {
    test(`${u} -> ${k} and back`, () => {
      assert.equal(unicodeToLegacy(u, KD), k);
      assert.equal(legacyToUnicode(unicodeToLegacy(u, KD), KD), u);
    });
  }
});

describe('no sentinels leak into output', () => {
  for (const [, cases] of groups) {
    for (const { k, u } of cases) {
      test(`clean: ${k}`, () => {
        assert.doesNotMatch(legacyToUnicode(k, KD), /[-]/);
        assert.doesNotMatch(unicodeToLegacy(u, KD), /[-]/);
      });
    }
  }
});

/**
 * The comma bug generalised. A character is safe only if unicodeToLegacy leaves
 * something the forward pass reads back as that same character - either a real
 * Kruti Dev key, or a character the forward map does not claim at all. There is
 * no third option, so this closure check replaces listing examples.
 */
describe('punctuation survives a round trip', () => {
  // Kruti Dev 010 has no key for these, verified against the glyph outlines in
  // public/fonts/KRDEV010.woff. Their ASCII slots are spent on something else,
  // so the reverse direction has nothing to emit and the forward pass reads the
  // raw character back as whatever its slot carries.
  const NO_LEGACY_KEY = new Map([
    ['%', 'the % slot draws ः'],
    ['&', 'the & slot draws the dash'],
    ['_', 'the _ slot draws ऋ'],
    ['|', 'the | slot draws द्य'],
    ['~', 'the ~ slot draws the halant'],
    ['[', 'the [ slot draws ख्'],
    ['<', 'the < slot draws ढ'],
    ['>', 'the > slot draws झ्'],
    ['`', 'the ` slot draws ृ'],
    ['#', 'the # slot draws रु'],
    [':', 'the : slot draws रू'],
    // Slots spent on the punctuation above, so the ASCII character itself is
    // now the one with no key. All rare in Hindi prose, and `@` and `/` are
    // protected inside emails and dates by splitProtected anyway - a worthwhile
    // trade for making the comma, full stop, slash and quotes work.
    [']', 'the ] slot IS the comma'],
    ['@', 'the @ slot IS the slash'],
    ['$', 'the $ slot IS the plus sign'],
    ['*', 'the * slot IS the apostrophe'],
    ['^', 'the ^ slot IS the apostrophe'],
    ['\\', 'the \\ slot IS the question mark'],
  ]);

  const PROBE = [
    ...' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
    '‘', '’', '“', '”', '–', '-', '…', '₹',
  ];

  for (const c of PROBE) {
    if (NO_LEGACY_KEY.has(c)) continue;
    test(`${JSON.stringify(c)} is not re-read as Devanagari`, () => {
      const u = `क${c}ख`;
      assert.equal(
        legacyToUnicode(unicodeToLegacy(u, KD), KD),
        u,
        `went out as ${JSON.stringify(unicodeToLegacy(u, KD))}`,
      );
    });
  }

  // Keeps the exclusion list honest: if a key is ever found for one of these,
  // this fails and the entry has to come out rather than quietly masking a fix.
  for (const [c, why] of NO_LEGACY_KEY) {
    test(`${JSON.stringify(c)} is still genuinely unmappable (${why})`, () => {
      const u = `क${c}ख`;
      assert.notEqual(legacyToUnicode(unicodeToLegacy(u, KD), KD), u);
    });
  }

  test('the reported sentences round trip unchanged', () => {
    for (const s of [
      'राष्ट्रभाषा हिंदी है, जो देश को एकता के सूत्र में बांधती है।',
      'विभिन्न धर्मों और संस्कृतियों के लोग मिल-जुलकर रहते हैं।',
    ]) {
      assert.equal(legacyToUnicode(unicodeToLegacy(s, KD), KD), s);
    }
  });
});

/**
 * DevLys 010 shares the Kruti Dev 010 layout, verified outline by outline - but
 * only on the keys the map uses. The two fonts genuinely disagree in the
 * 0x80-0x9F block, so sharing one object is safe exactly as long as no key lands
 * there. This is the test that notices if one ever does.
 */
describe('DevLys shares the Kruti Dev layout, and only where that is true', () => {
  const DL = FONTS.devlys.map;

  test('no Kruti Dev key uses a codepoint where the two fonts differ', () => {
    const { from, to, extra } = DEVLYS_DIVERGENT_RANGE;
    for (const key of Object.keys(KD)) {
      for (const ch of key) {
        const cp = ch.codePointAt(0);
        const bad = (cp >= from && cp <= to) || extra.includes(cp);
        assert.ok(
          !bad,
          `key ${JSON.stringify(key)} uses U+${cp.toString(16).toUpperCase()}, ` +
            'which draws a different glyph in DevLys 010. Split DEVLYS from ' +
            'KRUTI_DEV before adding it.',
        );
      }
    }
  });

  test('every Kruti Dev fixture decodes identically through the DevLys map', () => {
    for (const [, cases] of groups) {
      for (const { k, u } of cases) {
        assert.equal(legacyToUnicode(k, DL), legacyToUnicode(k, KD), `on ${k}`);
      }
    }
  });

  test('the DevLys sample decodes to real Hindi', () => {
    assert.equal(legacyToUnicode(FONTS.devlys.sample, DL), 'हिन्दी भारत की राजधानी भाषा है।');
  });

  test('DevLys round-trips the documented test pairs', () => {
    for (const [k, u] of [
      ['fgUnh', 'हिन्दी'],
      ['Hkkjr', 'भारत'],
      ['jk"Vªh;', 'राष्ट्रीय'],
      ["f'k{kk", 'शिक्षा'],
      ['Ñi;k', 'कृपया'],
      ['iz/kkuea=h', 'प्रधानमंत्री'],
      ['fo|ky;', 'विद्यालय'],
      ['gS] rks', 'है, तो'],
    ]) {
      assert.equal(legacyToUnicode(k, DL), u);
      assert.equal(legacyToUnicode(unicodeToLegacy(u, DL), DL), u);
    }
  });

  test('DevLys and Kruti Dev are interchangeable end to end', () => {
    const doc = 'राष्ट्रभाषा हिंदी है, जो देश को एकता के सूत्र में बांधती है।';
    assert.equal(convert(doc, 'unicode', 'devlys'), convert(doc, 'unicode', 'kruti-dev'));
    assert.equal(convert(doc, 'unicode', 'devlys', { keepEnglish: false }), unicodeToLegacy(doc, DL, { keepEnglish: false }));
  });
});

describe('convert() routing', () => {
  test('kruti-dev -> unicode', () => {
    assert.equal(convert('Hkkjr', 'kruti-dev', 'unicode'), 'भारत');
  });

  test('kruti-dev -> mangal is the same text (Mangal is a Unicode font)', () => {
    assert.equal(
      convert('Hkkjr', 'kruti-dev', 'mangal'),
      convert('Hkkjr', 'kruti-dev', 'unicode'),
    );
  });

  test('mangal -> unicode is identity', () => {
    assert.equal(convert('भारत', 'mangal', 'unicode'), 'भारत');
  });

  test('unicode -> kruti-dev', () => {
    assert.equal(convert('भारत', 'unicode', 'kruti-dev'), 'Hkkjr');
  });

  test('legacy -> legacy routes through unicode', () => {
    assert.equal(convert('Hkkjr', 'kruti-dev', 'devlys'), 'Hkkjr');
  });

  test('empty input is empty output', () => {
    assert.equal(convert('', 'kruti-dev', 'unicode'), '');
  });

  test('unknown font throws', () => {
    assert.throws(() => convert('x', 'kruti-dev', 'nope'), /Unknown font/);
  });

  test('a font with no map at all is flagged unavailable', () => {
    // "Unavailable" means there is nothing to convert WITH - an empty table.
    // It is not the same question as `accurate`, which asks whether a table
    // that does exist has been verified. Chanakya now has a table and so is no
    // longer unavailable; it is still not accurate, and the test for that gate
    // lives in chanakya.test.js.
    assert.equal(isPairUnavailable('shusha', 'unicode'), true);
    assert.equal(isPairUnavailable('preeti', 'unicode'), false);
    assert.equal(isPairUnavailable('chanakya', 'unicode'), false);
    assert.equal(isPairUnavailable('kruti-dev', 'unicode'), false);
  });
});

describe('english safety toggle', () => {
  test('off: numbers become devanagari digits', () => {
    assert.equal(legacyToUnicode('2024', KD, { keepEnglish: false }), '२०२४');
  });

  test('on: numbers stay as-is', () => {
    assert.equal(legacyToUnicode('2024', KD, { keepEnglish: true }), '2024');
  });

  test('URLs are protected even with the toggle off', () => {
    assert.match(
      legacyToUnicode('https://mykrutidev.com', KD, { keepEnglish: false }),
      /https:\/\/mykrutidev\.com/,
    );
  });

  /**
   * Rule 3, the only rule of the three that has to look at what the token
   * decodes to: a capitalised word whose Devanagari would be structurally
   * impossible was never Hindi to begin with.
   *
   * These are the names and words that actually show up in a Kruti Dev
   * document - a signature line, a place, a product - and the toggle exists so
   * they come out of a converted file still readable.
   */
  test('a capitalised word that decodes to nonsense is left as English', () => {
    for (const word of ['Rahul', 'Sharma', 'Singh', 'Chennai', 'Sunday']) {
      assert.equal(
        legacyToUnicode(word, KD, { keepEnglish: true }),
        word,
        `${word} was converted instead of being kept`,
      );
    }
  });

  test('the same words convert when the toggle is off', () => {
    // Otherwise the test above would pass on a converter that never converts.
    for (const word of ['Rahul', 'Sharma', 'Singh']) {
      assert.notEqual(legacyToUnicode(word, KD, { keepEnglish: false }), word);
    }
  });

  test('rule 3 needs the capital - the same letters lowercase convert', () => {
    // RE_CAPITALISED is what separates a name from a Hindi word that happens to
    // decode badly, so the capital is doing real work and not decoration.
    assert.notEqual(legacyToUnicode('rahul', KD, { keepEnglish: true }), 'rahul');
  });

  /**
   * The documented limit of rule 3, pinned so it stays honest. A capitalised
   * proper noun that decodes to structurally valid Devanagari cannot be caught,
   * and "Delhi" is the real example: it is not in the word list, it is not
   * all-caps, and क्मसीप breaks no rule. If one of these ever starts being kept
   * the heuristic widened and the comment in looksEnglish() needs rewriting.
   */
  test('a capitalised name that decodes cleanly is still a known miss', () => {
    for (const word of ['Delhi', 'Meena']) {
      assert.notEqual(legacyToUnicode(word, KD, { keepEnglish: true }), word);
    }
  });

  test('the word list catches what the decode check cannot', () => {
    // "India" decodes cleanly too, so only rule 1 saves it - which is why the
    // list exists alongside the structural check rather than instead of it.
    assert.equal(legacyToUnicode('India', KD, { keepEnglish: true }), 'India');
    assert.ok(isWellFormedDevanagari(legacyToUnicode('India', KD, { keepEnglish: false })));
  });

  test('an ALL-CAPS run is kept without needing to decode it', () => {
    for (const word of ['PAN', 'IFSC', 'GST']) {
      assert.equal(legacyToUnicode(word, KD, { keepEnglish: true }), word);
    }
  });
});

describe('isWellFormedDevanagari', () => {
  const ok = ['भारत', 'कि', 'कर्म', 'क्रम', 'क़', 'हिन्दी'];
  const bad = [
    'ा', 'ेक', 'क्', 'ंक',
    // A halant with nothing to kill. This is what an English word decodes to
    // when a `z` lands somewhere a consonant never was - "Azure" gives ।्रनतम.
    '्र', 'ा्र', '।्रनतम',
    // A vowel sign on an independent vowel: आे is not how ओ is written.
    'आे',
    // A nukta with no consonant under it.
    '़',
  ];
  for (const s of ok) test(`well formed: ${s}`, () => assert.ok(isWellFormedDevanagari(s)));
  for (const s of bad) test(`malformed: ${s}`, () => assert.ok(!isWellFormedDevanagari(s)));

  test('an orphan halant is rejected for being orphaned, not for trailing', () => {
    // 'क्' is already rejected by the word-final-halant rule. '्क' can only be
    // caught by the rule that a halant needs a consonant before it, so this is
    // the case that keeps that rule honest.
    assert.ok(!isWellFormedDevanagari('्क'));
  });

  test('a decode with no Devanagari in it is not well-formed Devanagari', () => {
    // The check answers "is this Hindi", so a run of Latin is a no.
    assert.ok(!isWellFormedDevanagari('abc'));
    assert.ok(!isWellFormedDevanagari('123'));
  });

  test('an empty decode is vacuously fine, not malformed', () => {
    // looksEnglish() would otherwise treat every token that decodes to nothing
    // as English on the strength of an empty string.
    assert.ok(isWellFormedDevanagari(''));
  });
});

describe('buildReverse', () => {
  test('first key wins for many-to-one mappings', () => {
    const rev = buildReverse({ d: 'क', Dk: 'क' });
    assert.equal(rev['क'], 'd');
  });

  test('is memoised per map object', () => {
    assert.equal(buildReverse(KD), buildReverse(KD));
  });
});

describe('font registry', () => {
  test('every font carries the fields the UI reads', () => {
    for (const [key, f] of Object.entries(FONTS)) {
      assert.equal(f.key, key, `${key}: key field must match its registry key`);
      for (const field of ['label', 'kind', 'css', 'accurate']) {
        assert.ok(f[field] !== undefined, `${key} is missing ${field}`);
      }
      assert.ok(['legacy', 'unicode'].includes(f.kind), `${key} has kind ${f.kind}`);
      assert.equal(typeof f.accurate, 'boolean', `${key}.accurate must be boolean`);
      if (f.kind === 'legacy') assert.ok(f.map, `${key} is legacy but has no map`);
    }
  });

  test('an accurate legacy font has a non-empty map', () => {
    for (const [key, f] of Object.entries(FONTS)) {
      if (f.kind === 'legacy' && f.accurate) {
        assert.ok(Object.keys(f.map).length > 0, `${key} claims accuracy with an empty map`);
      }
    }
  });

  test('an accurate font has a real sample and placeholder to show', () => {
    for (const [key, f] of Object.entries(FONTS)) {
      if (!f.accurate) continue;
      assert.ok(f.sample, `${key} is live but has no sample`);
      assert.ok(f.placeholder, `${key} is live but has no placeholder`);
    }
  });

  test('every legacy sample decodes to Devanagari, not gibberish', () => {
    for (const [key, f] of Object.entries(FONTS)) {
      if (f.kind !== 'legacy' || !f.sample) continue;
      const out = legacyToUnicode(f.sample, f.map);
      assert.match(out, /[ऀ-ॿ]/, `${key} sample did not decode: ${out}`);
    }
  });

  test('the Kruti Dev placeholder is real Kruti Dev', () => {
    const bare = FONTS['kruti-dev'].placeholder.replace(/\s*\(example\)\s*$/, '');
    assert.equal(legacyToUnicode(bare, FONTS['kruti-dev'].map), 'भारतेन्दु हरिश्चन्द्र');
  });

  test('isPairAccurate needs both ends verified', () => {
    assert.equal(isPairAccurate('kruti-dev', 'unicode'), true);
    assert.equal(isPairAccurate('kruti-dev', 'devlys'), true);
    assert.equal(isPairAccurate('kruti-dev', 'chanakya'), false);
    assert.equal(isPairAccurate('chanakya', 'unicode'), false);
    assert.equal(isPairAccurate('shusha', 'unicode'), false);
  });

  test('boxLabel disambiguates Unicode as Hindi', () => {
    // A phone keypad types Unicode, so both words have to appear.
    assert.equal(boxLabel('unicode'), 'Unicode / Hindi');
    assert.equal(boxLabel('kruti-dev'), 'Kruti Dev');
  });

  /**
   * The copy button used to read "Copy Kruti code" on every legacy page,
   * including the DevLys ones, because the string was typed into the shared
   * component. It now comes from here, so the name follows the page's output
   * font.
   */
  test('codeLabel names the font the button actually hands over', () => {
    assert.equal(codeLabel('kruti-dev'), 'Kruti');
    assert.equal(codeLabel('devlys'), 'DevLys');
    assert.equal(codeLabel('chanakya'), 'Chanakya');
  });

  test('every legacy font can name itself on a copy button', () => {
    const seen = new Set();
    for (const [key, f] of Object.entries(FONTS)) {
      if (f.kind !== 'legacy') continue;
      const name = codeLabel(key);
      assert.ok(name && name !== key, `${key} has no usable copy-button name`);
      // Two legacy fonts sharing a button label would make the two pages
      // indistinguishable at exactly the point the user has to choose.
      assert.ok(!seen.has(name), `${key} shares the copy-button name "${name}"`);
      seen.add(name);
    }
  });
});

describe('describeMismatch - the wrong-page hint', () => {
  const KDsample = FONTS['kruti-dev'].sample;

  test('stays quiet on correct Kruti Dev input', () => {
    assert.equal(describeMismatch(KDsample, 'kruti-dev'), null);
    assert.equal(describeMismatch('Hkkjr dh jkt/kkuh', 'kruti-dev'), null);
    assert.equal(describeMismatch('fganh Hkkjr 2024', 'kruti-dev'), null);
  });

  test('stays quiet on correct Hindi input', () => {
    assert.equal(describeMismatch('हिंदी भारत की राजधानी है।', 'unicode'), null);
    assert.equal(describeMismatch('राम', 'unicode'), null);
  });

  test('catches Unicode pasted into a legacy box', () => {
    assert.equal(
      describeMismatch('भारत की राजधानी', 'kruti-dev'),
      'expected-legacy-got-unicode',
    );
  });

  test('catches plain English on a legacy page', () => {
    assert.equal(
      describeMismatch('this is the report for the office', 'kruti-dev'),
      'expected-legacy-got-english',
    );
  });

  test('catches Latin typing on a Hindi page', () => {
    assert.equal(
      describeMismatch('hello there my friend', 'unicode'),
      'expected-unicode-got-latin',
    );
  });

  test('says nothing until there is something to judge', () => {
    for (const s of ['', ' ', 'a', 'abc', 'Hk']) {
      assert.equal(describeMismatch(s, 'kruti-dev'), null, `fired on ${JSON.stringify(s)}`);
    }
  });

  test('mixed Hindi and English on a Unicode page is fine', () => {
    assert.equal(describeMismatch('मेरा PAN नम्बर', 'unicode'), null);
  });

  test('an unknown font never throws', () => {
    assert.equal(describeMismatch('anything at all', 'nope'), null);
  });
});

/**
 * Document structure is not the converter's business: it remaps font characters
 * and leaves everything between them alone. Pasting a report in and getting one
 * run-on paragraph back would make the tool useless for the documents it exists
 * to convert, so every separator a real paste can carry is pinned here.
 */
describe('whitespace and line breaks pass through untouched', () => {
  const SEPARATORS = [
    ['\n', 'LF'],
    ['\r\n', 'CRLF'],
    ['\r', 'CR (old Mac, and some Word copy paths)'],
    ['\n\n', 'blank line between paragraphs'],
    ['\n\n\n\n', 'several blank lines'],
    ['\t', 'tab'],
    ['    ', 'runs of spaces'],
    ['\n   \n', 'a whitespace-only line'],
    ['\u000b', 'vertical tab - what Shift+Enter in Word pastes as'],
    ['\u000c', 'form feed - a Word page break'],
    [' ', 'non-breaking space'],
    [' ', 'LINE SEPARATOR, common in PDF copy'],
    [' ', 'PARAGRAPH SEPARATOR, common in PDF copy'],
    ['　', 'ideographic space'],
    ['﻿', 'a stray BOM mid-document'],
  ];

  for (const [ws, why] of SEPARATORS) {
    test(`legacy -> unicode keeps ${why}`, () => {
      assert.equal(
        legacyToUnicode(`ldrkA${ws}vaxzstksa`, KD),
        `सकता।${ws}अंग्रेजों`,
      );
    });

    test(`unicode -> legacy keeps ${why}`, () => {
      assert.equal(
        unicodeToLegacy(`सकता।${ws}अंग्रेजों`, KD),
        `ldrkA${ws}vaxzstksa`,
      );
    });

    // The English-safety pass walks tokens rather than the whole string, so it
    // is the one that could plausibly eat a separator. Check it with the
    // protection off too, which takes the other branch entirely.
    test(`keepEnglish:false keeps ${why}`, () => {
      assert.equal(
        legacyToUnicode(`ldrkA${ws}vaxzstksa`, KD, { keepEnglish: false }),
        `सकता।${ws}अंग्रेजों`,
      );
    });
  }

  test('leading and trailing whitespace is never trimmed', () => {
    for (const s of ['\n\nभारत\n\n', '  भारत  ', '\tभारत\t', '\n']) {
      assert.equal(legacyToUnicode(unicodeToLegacy(s, KD), KD), s);
    }
  });

  test('a two-paragraph document comes back as two paragraphs', () => {
    const doc =
      'राष्ट्रभाषा हिंदी है, जो देश को एकता के सूत्र में बांधती है।\n\n' +
      'अंग्रेजों के शासन में भी यह भाषा जीवित रही।';
    const legacy = unicodeToLegacy(doc, KD);
    assert.match(legacy, /\n\n/, `the break was lost: ${JSON.stringify(legacy)}`);
    assert.equal(legacyToUnicode(legacy, KD), doc);
    assert.equal(legacyToUnicode(legacy, KD).split('\n').length, 3);
  });

  test('line count survives a long document unchanged', () => {
    // Blank every third line, so the run includes empty lines as well as full
    // ones - an empty line is the case a naive split/join drops.
    const doc = Array.from({ length: 60 }, (_, i) =>
      i % 3 === 2 ? '' : `पैराग्राफ ${i} - राष्ट्रभाषा हिंदी है, जो देश को बांधती है।`,
    ).join('\n');
    const back = legacyToUnicode(unicodeToLegacy(doc, KD), KD);
    assert.equal(back.split('\n').length, 60);
    assert.equal(back, doc);
  });

  test('protected spans do not swallow the newline after them', () => {
    // URLs, emails and numbers are matched by splitProtected, whose regexes end
    // at the first whitespace. An over-greedy one would eat the break with it.
    const doc =
      'देखें https://mykrutidev.com/help\n\nऔर info@mykrutidev.com\n\nदिनांक 15/08/1947\n\nसमाप्त';
    assert.equal(legacyToUnicode(unicodeToLegacy(doc, KD), KD), doc);
  });
});

describe('robustness', () => {
  test('unmapped characters pass through', () => {
    assert.match(legacyToUnicode('©', KD), /©/);
  });

  test('a large input does not blow up', () => {
    const big = 'Hkkjr '.repeat(20000);
    const out = legacyToUnicode(big, KD);
    assert.equal(out.trim().split(/\s+/).length, 20000);
  });
});
