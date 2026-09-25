import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { FONTS, convert, isAccurate } from './fontMaps.js';
import { getPage, isLive } from './routes.js';
import { previewFontFor } from './legacyFonts.js';

const CHANAKYA = FONTS.chanakya.map;

/** Chanakya -> Unicode. */
const toU = (s) => convert(s, 'chanakya', 'unicode');
/** Unicode -> Chanakya. */
const toC = (s) => convert(s, 'unicode', 'chanakya');

// ---------------------------------------------------------------------------
// The one check that looks at something OUTSIDE this table
// ---------------------------------------------------------------------------

/**
 * Read a font's glyph shapes, so two fonts can be asked whether they share a
 * keyboard layout.
 *
 * This is the same method the DEVLYS map was verified with, and it is the only
 * check in this file that looks at anything OUTSIDE the table. Everything else
 * here tests the table against itself, which by construction cannot notice that
 * the table describes a different font than the one we ship.
 *
 * Shape is compared as contour count + bounding box + advance width. That is
 * coarse enough to survive two cuts of the same letter and far too strict to
 * confuse one letter with another.
 */
function glyphMetrics(file) {
  const buf = readFileSync(fileURLToPath(new URL(`../../public/fonts/${file}`, import.meta.url)));
  const V = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  // Both raw TrueType and WOFF appear in public/fonts - see its README.
  let tables;
  if (buf.subarray(0, 4).toString('latin1') === 'wOFF') {
    const dv = V(buf);
    tables = {};
    for (let i = 0; i < dv.getUint16(12); i += 1) {
      const o = 44 + i * 20;
      const tag = buf.subarray(o, o + 4).toString('latin1');
      const off = dv.getUint32(o + 4);
      const comp = dv.getUint32(o + 8);
      const orig = dv.getUint32(o + 12);
      const raw = buf.subarray(off, off + comp);
      tables[tag] = comp === orig ? Buffer.from(raw) : inflateSync(raw);
    }
  } else {
    const dv = V(buf);
    tables = {};
    for (let i = 0; i < dv.getUint16(4); i += 1) {
      const o = 12 + i * 16;
      tables[buf.subarray(o, o + 4).toString('latin1')] = buf.subarray(
        dv.getUint32(o + 8),
        dv.getUint32(o + 8) + dv.getUint32(o + 12),
      );
    }
  }

  const head = V(tables.head);
  const loca = V(tables.loca);
  const hmtx = V(tables.hmtx);
  const unitsPerEm = head.getUint16(18);
  const longLoca = head.getInt16(50) === 1;
  const numGlyphs = V(tables.maxp).getUint16(4);
  const numH = V(tables.hhea).getUint16(34);

  const cm = V(tables.cmap);
  let sub = 0;
  for (let i = 0; i < cm.getUint16(2); i += 1) {
    const r = 4 + i * 8;
    const s = cm.getUint32(r + 4);
    if (cm.getUint16(r) === 3 && cm.getUint16(r + 2) === 1 && cm.getUint16(s) === 4) sub = s;
  }
  assert.ok(sub, `${file} should have a Windows format-4 cmap`);

  const segX2 = cm.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  const gidFor = (cp) => {
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = cm.getUint16(ends + s * 2);
      if (cp > end) continue;
      const st = cm.getUint16(starts + s * 2);
      if (cp < st) return 0;
      const ro = cm.getUint16(ranges + s * 2);
      if (ro === 0) return (cp + cm.getInt16(deltas + s * 2)) & 0xffff;
      const g = cm.getUint16(ranges + s * 2 + ro + (cp - st) * 2);
      return g === 0 ? 0 : (g + cm.getInt16(deltas + s * 2)) & 0xffff;
    }
    return 0;
  };

  const at = (i) => (longLoca ? loca.getUint32(i * 4) : loca.getUint16(i * 2) * 2);
  const scale = 1000 / unitsPerEm;

  return (cp) => {
    const g = gidFor(cp);
    if (!g || g >= numGlyphs) return null;
    const adv = Math.round(hmtx.getUint16(Math.min(g, numH - 1) * 4) * scale);
    const a = at(g);
    const b = at(g + 1);
    if (b <= a) return { contours: 0, w: 0, h: 0, adv };
    const gl = V(tables.glyf.subarray(a, b));
    return {
      contours: gl.getInt16(0),
      w: Math.round((gl.getInt16(6) - gl.getInt16(2)) * scale),
      h: Math.round((gl.getInt16(8) - gl.getInt16(4)) * scale),
      adv,
    };
  };
}

/** How many of ASCII 33-126 the two fonts draw identically. */
function layoutAgreement(a, b) {
  let same = 0;
  let total = 0;
  for (let cp = 33; cp <= 126; cp += 1) {
    const x = a(cp);
    const y = b(cp);
    if (!x || !y) continue;
    total += 1;
    if (
      x.contours === y.contours &&
      Math.abs(x.w - y.w) <= 20 &&
      Math.abs(x.h - y.h) <= 20 &&
      Math.abs(x.adv - y.adv) <= 20
    ) {
      same += 1;
    }
  }
  return { same, total, pct: Math.round((same / total) * 100) };
}

describe('there is no Walkman-Chanakya font yet - which is why this is off', () => {
  // This suite asserts a PROBLEM, on purpose. It is the thing standing between
  // a plausible-looking table and a converter that quietly produces the wrong
  // Hindi. The old chanakya.woff drew different letters than this table (6 of
  // 94 glyphs agreed with the layout; see the note above CHANAKYA) and was
  // removed. When the real Walkman-Chanakya 905 font is added, these tests are
  // what must be rewritten: compare it with glyphMetrics() the way DevLys is
  // compared below, and only then flip `accurate`.
  const kruti = glyphMetrics('KRDEV010.woff');
  const devlys = glyphMetrics('devlys-010.woff');

  test('the table is a Remington layout, nearly identical to Kruti Dev', () => {
    const shared = Object.keys(CHANAKYA).filter((k) => k in FONTS['kruti-dev'].map);
    const agree = shared.filter((k) => CHANAKYA[k] === FONTS['kruti-dev'].map[k]);
    assert.ok(shared.length > 90, `expected a lot of overlap, got ${shared.length}`);
    assert.ok(
      agree.length / shared.length > 0.9,
      `expected >90% agreement with Kruti Dev, got ${agree.length}/${shared.length}`,
    );
  });

  test('DevLys vs Kruti Dev is the control: same layout, glyphs agree', () => {
    const { pct } = layoutAgreement(devlys, kruti);
    assert.ok(pct > 95, `two fonts sharing a layout should agree; got ${pct}%`);
  });

  test('no font file is shipped for it, so the table cannot be checked against one', () => {
    assert.equal(previewFontFor('chanakya'), null);
  });

  test('so the font stays gated, and the gate is not a formality', () => {
    // Without a verified font there is nothing to prove the table right.
    assert.equal(isAccurate('chanakya'), false);
  });
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

describe('round trip: Unicode -> Chanakya -> Unicode', () => {
  // The eight pairs written into the note above CHANAKYA, plus the cases that
  // broke first when the Kruti Dev map was built.
  //
  // READ THIS BEFORE TRUSTING A GREEN RUN: a round trip proves the two
  // directions agree with each other, NOT that either agrees with the font.
  // Both could be wrong in the same way and every line here would still pass.
  // That is exactly why chanakya stays accurate: false.
  const WORDS = [
    ['हिंदी', 'the i-matra moves right'],
    ['हिन्दी', 'explicit halant spelling'],
    ['भारत', 'plain consonants'],
    ['परीक्षा', 'क्ष'],
    ['राष्ट्रीय', 'ष्ट्र plus a reph'],
    ['कार्यालय', 'a reph that must hop back over a matra'],
    ['प्रधानमंत्री', 'त्र and प्र in one word'],
    ['बड़ा', 'nukta'],
    ['ज्ञान', 'ज्ञ'],
    ['श्री', 'श्र'],
    ['क्षेत्रीय', 'क्ष and त्र together'],
    ['विद्यालय', 'द्य'],
    ['कृपया', 'the ृ matra'],
    ['प्रश्न', 'श्न'],
    ['दिनांक', 'i-matra with an anusvara later'],
    ['गंगा', 'anusvara'],
    ['माँ', 'chandrabindu'],
    ['ढूंढ', 'ढ twice'],
    ['पढ़ाई', 'ढ़ and ई'],
    ['क्षेत्रीय कार्यालय', 'two words'],
    ['कृपया प्रश्न पत्र देखें।', 'a sentence with a danda'],
    ['है, तो', 'a real comma, which is not the , key'],
    ['दिनांक 15/08/1947 को', 'digits and a slash survive'],
  ];

  for (const [word, why] of WORDS) {
    test(`${word} (${why})`, () => {
      const legacy = toC(word);
      assert.notEqual(legacy, '', 'should produce something');
      assert.equal(toU(legacy), word);
    });
  }

  test('no private-use sentinel ever reaches the output', () => {
    // REPH is a marker the engine uses internally. If one survives, it lands in
    // the user's clipboard as an invisible or box-drawn character.
    for (const [word] of WORDS) {
      assert.doesNotMatch(toC(word), /[-]/, `${word} leaked a sentinel`);
      assert.doesNotMatch(toU(toC(word)), /[-]/, `${word} leaked a sentinel`);
    }
  });
});

// ---------------------------------------------------------------------------
// The individual rules, each pinned on its own
// ---------------------------------------------------------------------------

describe('the two reorder rules', () => {
  test('the i-matra is typed before its consonant and read after it', () => {
    // `f` comes first in the Chanakya text; ि belongs after the क in Unicode.
    assert.equal(toU('fganh'), 'हिंदी');
    assert.equal(toU('fnUkkaDk'), 'दिनांक');
  });

  test('the reph is typed after its cluster and read before it', () => {
    assert.equal(toU('DkkÕkkZYkÕk'), 'कार्यालय');
    assert.equal(toU('DkEkZ'), 'कर्म');
  });

  test('a reph steps over a trailing matra but never over the i-matra', () => {
    // कीर्ति is the case that separates the two: the reph must land before the
    // त that the i-matra is about to hop across.
    assert.equal(toU(toC('कीर्ति')), 'कीर्ति');
    assert.equal(toU(toC('कार्य')), 'कार्य');
  });
});

describe('the half-consonant plus vertical bar rule', () => {
  // Chanakya writes many full consonants as "half form + the bar glyph", and
  // the bar is the SAME key as the aa-matra. Only longest-match-first tells
  // `Dk` (क) apart from `D` + `k` (क् + ा).
  const PAIRS = [
    ['Dk', 'क'], ['[k', 'ख'], ['Xk', 'ग'], ['?k', 'घ'], ['Pk', 'च'],
    ['Tk', 'ज'], ['.k', 'ण'], ['Rk', 'त'], ['Fk', 'थ'], ['èk', 'ध'],
    ['Uk', 'न'], ['Ik', 'प'], ['Ck', 'ब'], ['Hk', 'भ'], ['Ek', 'म'],
    ['Õk', 'य'], ['Yk', 'ल'], ['Ok', 'व'], ["'k", 'श'], ['"k', 'ष'],
    ['Lk', 'स'],
  ];
  for (const [legacy, uni] of PAIRS) {
    test(`${legacy} is ${uni}, not a half form with an aa-matra`, () => {
      assert.equal(toU(legacy), uni);
      assert.equal(toU(`${legacy}k`), `${uni}ा`, 'and adding a real bar gives the matra');
    });
  }
});

describe('फ् and फ्र, the two the table was missing', () => {
  // The full फ is `iQ`/`IkQ` - a half प plus the Q hook - and that spelling has
  // no half form of its own. So before `Ý` and `Ú` existed, Unicode -> Chanakya
  // could not write फ् or फ्र at all: the letter simply fell out. Both
  // directions are pinned because the gap was only ever visible in one.
  test('Ý is फ् and Ú is फ्र', () => {
    assert.equal(toU('Ý'), 'फ्');
    assert.equal(toU('Ú'), 'फ्र');
  });

  test('and they are reachable from the Unicode side', () => {
    assert.equal(toC('फ्'), 'Ý');
    assert.equal(toC('फ्र'), 'Ú');
  });

  test('they do not disturb the full फ, which is still iQ', () => {
    assert.equal(toU('IkQ'), 'फ');
    assert.equal(toU('iQ'), 'फ');
    assert.equal(toC('फल'), 'IkQYk');
    assert.equal(toU(toC('सफाई')), 'सफाई');
  });

  for (const w of ['फ्र', 'फ्री', 'सफ्र', 'कफ्ता']) {
    test(`${w} round trips`, () => assert.equal(toU(toC(w)), w));
  }
});

describe('nukta letters', () => {
  // Written as base + U+093C escapes rather than literals. The precomposed
  // single codepoints (ऱ is U+0931, ऩ is U+0929) look identical in an editor
  // and are not equal, so a literal here would assert the wrong thing while
  // appearing to assert the right one.
  const N = '़';
  const PAIRS = [
    ['d+', `क${N}`], ['x+', `ग${N}`], ['t+', `ज${N}`],
    ['M+', `ड${N}`], ['<+', `ढ${N}`], [';+', `य${N}`],
    ['j+', `र${N}`], ['u+', `न${N}`],
  ];
  for (const [legacy, uni] of PAIRS) {
    test(`${legacy} is ${uni}`, () => assert.equal(toU(legacy), uni));
  }

  test('the nukta is stored decomposed, as everywhere else in the engine', () => {
    // deva.js normalises precomposed forms to base + U+093C, and the Kruti map
    // builds them the same way. A precomposed ड़ here would compare unequal to
    // the identical-looking ड़ from any other page.
    for (const [legacy] of PAIRS) {
      const out = toU(legacy);
      assert.doesNotMatch(out, /[क़-य़ऩऱऴ]/, `${legacy} is precomposed`);
      assert.ok(out.includes('़'), `${legacy} lost its nukta`);
    }
  });

  test('the half forms put the nukta before the halant', () => {
    // `[+` is ख + ़ + ्, not ख् + ़. Composing the pieces would give the wrong
    // order, which is why these have their own entries.
    assert.equal(toU('[+'), 'ख़्');
    assert.equal(toU('T+'), 'ज़्');
  });
});

describe('punctuation, in this font\'s own encoding', () => {
  // Chanakya spends ASCII slots on Devanagari, so nothing may pass through
  // blindly. This is the same trap that produced "हैए" in Kruti Dev.
  const PAIRS = [
    [']', ','], ['A', '।'], ['&', '-'], ['@', '/'],
    ['¾', '='], ['%', ':'], ['¢', 'ः'], ['ñ', '॰'],
    ['¿', '{'], ['À', '}'],
  ];
  for (const [legacy, uni] of PAIRS) {
    test(`${legacy} is ${uni}`, () => assert.equal(toU(legacy), uni));
  }

  test('the comma key is ] and the , key is the vowel ए', () => {
    assert.equal(toU(','), 'ए');
    assert.equal(toU(',Dk'), 'एक');
    assert.equal(toU('gS]'), 'है,');
    // The loop that the Kruti comma bug closed: a real comma must come back out
    // as `]`, or the forward pass will read it as ए next time round.
    assert.equal(toC('है,'), 'gS]');
    assert.equal(toU(toC('है, तो')), 'है, तो');
  });

  test('a real colon survives, even though : is रू', () => {
    assert.equal(toU(':'), 'रू');
    assert.equal(toU('%'), ':');
    assert.equal(toU(toC('समय: 10')), 'समय: 10');
  });
});

describe('English and numbers are left alone', () => {
  test('an all-caps acronym and a date survive', () => {
    assert.equal(toU('fnUkkaDk 15/08/1947 Dkks PAN'), 'दिनांक 15/08/1947 को PAN');
  });

  test('whitespace is preserved exactly', () => {
    assert.equal(toU('Hkkjr  Dkh\njkTkèkkUkh'), 'भारत  की\nराजधानी');
  });

  test('the registry sample decodes to real Hindi', () => {
    assert.equal(toU(FONTS.chanakya.sample), 'हिन्दी भारत की राजधानी है।');
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('Chanakya stays behind the accuracy gate', () => {
  test('the font is not marked accurate', () => {
    // The table is complete and green. It is still not verified against a real
    // Chanakya document, and `accurate` means verified. Flipping this without
    // that evidence is the one thing this whole file exists to discourage.
    assert.equal(isAccurate('chanakya'), false);
  });

  for (const path of [
    '/chanakya-to-unicode',
    '/unicode-to-chanakya',
    '/chanakya-to-kruti-dev',
    '/kruti-dev-to-chanakya',
  ]) {
    test(`${path} is not live`, () => {
      const page = getPage(path);
      assert.ok(page, 'the page should exist');
      assert.equal(isLive(page), false);
      assert.ok(page.note && page.note.length > 40, 'and should say why');
    });
  }
});

describe('adding Chanakya did not disturb the verified fonts', () => {
  test('it is its own object, sharing nothing with Kruti Dev', () => {
    assert.notEqual(CHANAKYA, FONTS['kruti-dev'].map);
    assert.notEqual(CHANAKYA, FONTS.devlys.map);
  });

  test('Kruti Dev still reads its own keys its own way', () => {
    // The characters that mean different things in the two layouts. If the two
    // tables were ever merged by accident, these are what would break first.
    assert.equal(convert('fganh', 'kruti-dev', 'unicode'), 'हिंदी');
    assert.equal(convert('Hkkjr', 'kruti-dev', 'unicode'), 'भारत');
    assert.equal(convert('{k', 'kruti-dev', 'unicode'), 'क्ष');
    assert.equal(convert('%', 'kruti-dev', 'unicode'), 'ः', 'Kruti % is visarg');
    assert.equal(convert('%', 'chanakya', 'unicode'), ':', 'Chanakya % is a colon');
  });
});
