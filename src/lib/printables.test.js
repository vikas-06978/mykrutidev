import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FONTS, convert } from './fontMaps.js';
import { layout, locate, FINGERS } from './remington.js';
import { LEVELS } from './lessons.js';
import { wholeKeys } from './tutor.build.js';
import {
  PRINTABLES,
  keyboardRows,
  practiceSheets,
  matraRows,
  MATRA_ITEMS,
  FINGER_TAG,
  LEGEND_FINGERS,
  pdfHref,
  pdfFile,
  chartRows,
  KRUTI_FONT,
} from './printables.js';
import { glyphChecker } from './fontGlyphs.js';

describe('the printables come from the tutor’s own data', () => {
  test('keyboard rows ARE the tutor keyboard: every key, normal and Shift', () => {
    assert.deepEqual(keyboardRows(), layout(FONTS['kruti-dev'].map));
    const caps = keyboardRows().flat();
    assert.equal(caps.length, 47);
    // Spot checks against the character map itself, both layers.
    const map = FONTS['kruti-dev'].map;
    for (const c of caps) {
      assert.equal(c.baseDeva, /[ऀ-ॿ]/.test(map[c.base] ?? '') ? map[c.base] : '', c.base);
      assert.equal(c.shiftDeva, /[ऀ-ॿ]/.test(map[c.shift] ?? '') ? map[c.shift] : '', c.shift);
    }
  });

  test('every finger on a key has a legend entry and a black-and-white tag', () => {
    const used = new Set(keyboardRows().flat().map((c) => c.finger));
    for (const f of used) {
      assert.ok(LEGEND_FINGERS.some((l) => l.id === f), f);
      assert.ok(FINGER_TAG[f], f);
    }
    assert.equal(new Set(Object.values(FINGER_TAG)).size, FINGERS.length, 'tags are distinct');
  });

  test('one practice sheet per tutor level, with exactly its drills', () => {
    const sheets = practiceSheets();
    assert.equal(sheets.length, LEVELS.length);
    sheets.forEach((s, i) => {
      assert.equal(s.id, LEVELS[i].id);
      assert.deepEqual(s.drills.map((d) => d.deva), LEVELS[i].drills);
    });
  });

  test('the keys printed under each drill type that drill', () => {
    for (const s of practiceSheets()) {
      for (const d of s.drills) {
        assert.equal(d.keys, wholeKeys(d.deva), `${s.id}: ${d.deva}`);
        assert.equal(convert(d.keys, 'kruti-dev', 'unicode', { keepEnglish: false }), d.deva, `${s.id}: round trip`);
        for (const ch of d.keys) assert.ok(locate(ch), `${s.id}: "${ch}" is on no key`);
      }
    }
  });

  test('the matra and conjunct chart: every sequence types its example, on real keys', () => {
    const rows = matraRows();
    assert.equal(rows.length, MATRA_ITEMS.length);
    for (const r of rows) {
      assert.equal(r.keys, wholeKeys(r.example), r.id);
      assert.equal(convert(r.keys, 'kruti-dev', 'unicode', { keepEnglish: false }), r.example, r.id);
      assert.equal(r.steps.map((s) => s.ch).join(''), r.keys);
      for (const s of r.steps) {
        const at = locate(s.ch);
        assert.deepEqual({ cap: s.cap, shift: s.shift }, { cap: at.cap, shift: at.shift }, `${r.id} ${s.ch}`);
      }
    }
    // The ones that were asked for by name are all there.
    for (const id of ['i', 'ii', 'rakar', 'reph', 'ksha', 'tra', 'gya', 'shra', 'nukta']) {
      assert.ok(rows.some((r) => r.id === id), id);
    }
    // And the classic ordering rules show: ि before its consonant, reph after.
    assert.deepEqual(rows.find((r) => r.id === 'i').keys, 'fd');
    assert.deepEqual(rows.find((r) => r.id === 'reph').keys, 'deZ');
  });

  test('five printables, each with its own PDF name and page count', () => {
    assert.equal(PRINTABLES.length, 5);
    assert.equal(new Set(PRINTABLES.map((p) => p.pdf)).size, 5);
    assert.equal(PRINTABLES.find((p) => p.kind === 'sheets').pages, LEVELS.length);
    assert.equal(pdfFile(PRINTABLES[0], 'en'), 'mykrutidev-kruti-dev-keyboard-chart.pdf');
    assert.equal(pdfHref(PRINTABLES[0], 'hi'), '/downloads/mykrutidev-kruti-dev-keyboard-chart-hindi.pdf');
    for (const p of PRINTABLES) {
      for (const lang of ['en', 'hi']) assert.match(pdfFile(p, lang), /^mykrutidev-[a-z-]+\.pdf$/);
    }
  });
});

describe('the keyboard chart is read from the Kruti Dev 010 font', () => {
  const kruti2unicode = (keys) => convert(keys, 'kruti-dev', 'unicode', { keepEnglish: false });
  const hasGlyph = glyphChecker(KRUTI_FONT);
  const caps = chartRows().flat();
  // Space is on the chart but is not a printable key.
  const printable = caps.filter((c) => c.base !== ' ');

  test('47 printable keys, 94 key + Shift combinations, every one drawn by the font', () => {
    assert.equal(printable.length, 47);
    const all = printable.flatMap((c) => [c.base, c.shift]);
    assert.equal(new Set(all).size, 94);
    for (const ch of all) assert.ok(hasGlyph(ch), `KRDEV010.woff has no glyph for ${JSON.stringify(ch)}`);
  });

  for (const c of printable) {
    for (const [ch, text] of [[c.base, c.baseText], [c.shift, c.shiftText]]) {
      test(`${JSON.stringify(ch)} is labelled kruti2unicode(${JSON.stringify(ch)})`, () => {
        // The reph is typed after its syllable, so alone it converts to nothing:
        // read after a consonant and take the consonant away (dZ = र्क -> र्).
        const expected = ch === 'Z' ? 'र्' : kruti2unicode(ch);
        assert.equal(text, expected);
        assert.notEqual(text, '', 'a key the font draws is never shown as typing nothing');
      });
    }
  }

  test('the keys the old chart showed as "-" (font glyph checked by rendering)', () => {
    const label = Object.fromEntries(printable.flatMap((c) => [[c.base, c.baseText], [c.shift, c.shiftText]]));
    assert.deepEqual(
      { '#': label['#'], '@': label['@'], $: label.$, ')': label[')'], G: label.G, ':': label[':'], Z: label.Z, '/': label['/'], '}': label['}'] },
      { '#': 'रु', '@': '/', $: '+', ')': 'द्ध', G: 'ळ', ':': 'रू', Z: 'र्', '/': 'ध्', '}': 'द्व' },
    );
    assert.equal(kruti2unicode('/k'), 'ध');
  });
});
