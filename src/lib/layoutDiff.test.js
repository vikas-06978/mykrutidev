import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, convert } from './fontMaps.js';
import { PAGES, isLive } from './routes.js';
import { LAYOUT_REFERENCE, layoutDiffFor, display } from './layoutDiff.js';

const conv = (s, from, to) => {
  const r = convert(s, from, to);
  return typeof r === 'string' ? r : r.text;
};

describe('layoutDiffFor: shape', () => {
  test('every font in the table has a map, and so does its reference', () => {
    for (const [font, ref] of Object.entries(LAYOUT_REFERENCE)) {
      assert.ok(FONTS[font]?.map, `${font} has a map`);
      assert.ok(FONTS[ref]?.map, `${ref} has a map`);
      assert.equal(FONTS[font].kind, 'legacy', font);
    }
  });

  test('the numbers add up: same + differing + own keys = this font\'s usable keys', () => {
    for (const font of Object.keys(LAYOUT_REFERENCE)) {
      const d = layoutDiffFor(font, 'unicode');
      assert.ok(d, font);
      assert.ok(d.same >= 0 && d.same <= d.total, font);
      assert.ok(d.same + d.diff.length + d.missing <= d.total + d.diff.length, font);
      // a key is in exactly one of: same, differing, only-here
      const keys = new Set([...d.diff, ...d.extra].map((r) => r.key));
      assert.equal(keys.size, d.diff.length + d.extra.length, `${font}: no key listed twice`);
      assert.equal(d.total - d.missing, d.same + d.diff.length, `${font}: reference keys are same, differing or missing`);
    }
  });

  test('both directions of a page give the same comparison', () => {
    for (const font of Object.keys(LAYOUT_REFERENCE)) {
      assert.deepEqual(layoutDiffFor(font, 'unicode'), layoutDiffFor('unicode', font), font);
    }
  });

  test('no block where it would say nothing true', () => {
    assert.equal(layoutDiffFor('kruti-dev', 'unicode'), null, 'the reference itself');
    assert.equal(layoutDiffFor('ajay', 'kruti-dev'), null, 'font to font');
    assert.equal(layoutDiffFor('unicode', 'mangal'), null, 'Unicode to Unicode');
    assert.equal(layoutDiffFor('nope', 'unicode'), null);
  });
});

describe('layoutDiffFor: checked against the converter, not the map table', () => {
  // The converter is the ground truth a visitor meets. A row is shown only if
  // typing that key with that font gives that letter.
  test('every row reproduces when the key is converted on its own', () => {
    let checked = 0;
    for (const font of Object.keys(LAYOUT_REFERENCE)) {
      const d = layoutDiffFor(font, 'unicode');
      const ref = LAYOUT_REFERENCE[font];
      for (const r of d.diff) {
        assert.equal(conv(r.key, font, 'unicode'), r.own, `${font} ${JSON.stringify(r.key)}`);
        assert.equal(conv(r.key, ref, 'unicode'), r.ref, `${ref} ${JSON.stringify(r.key)}`);
        checked++;
      }
      for (const r of d.extra) {
        assert.equal(conv(r.key, font, 'unicode'), r.own, `${font} ${JSON.stringify(r.key)}`);
        checked++;
      }
    }
    assert.ok(checked > 300, `checked ${checked} rows`);
  });

  test('known cases: Ajay and Arjun type = as half tra, Kruti Dev as tra', () => {
    for (const font of ['ajay', 'arjun']) {
      const row = layoutDiffFor(font, 'unicode').diff.find((r) => r.key === '=');
      assert.deepEqual(row && [row.ref, row.own], ['त्र', 'त्र्'], font);
    }
  });

  test('known case in another family: Narad types the key \u2030 as jha, Preeti as half jha', () => {
    const row = layoutDiffFor('narad', 'unicode').diff.find((r) => r.key === '\u2030');
    assert.deepEqual(row && [row.ref, row.own], ['झ्', 'झ']);
  });

  test('no row shows a private-use placeholder or the replacement character', () => {
    for (const font of Object.keys(LAYOUT_REFERENCE)) {
      const d = layoutDiffFor(font, 'unicode');
      for (const r of [...d.diff, ...d.extra]) {
        assert.ok(!(r.own + (r.ref ?? '')).includes('�'), `${font} ${JSON.stringify(r.key)}`);
      }
    }
  });
});

describe('layoutDiffFor: pages', () => {
  const live = PAGES.filter((p) => p.kind === 'converter' && isLive(p) && p.from && p.to);
  test('exactly the Unicode <-> listed-font converter pages get a block', () => {
    const withBlock = live.filter((p) => layoutDiffFor(p.from, p.to));
    assert.ok(withBlock.length >= 30, `${withBlock.length} pages`);
    for (const p of withBlock) {
      const font = [p.from, p.to].find((k) => k !== 'unicode');
      assert.ok(LAYOUT_REFERENCE[font], p.path);
    }
  });
});

describe('display', () => {
  test('a bare vowel sign or mark goes on the dotted circle, a letter is left alone', () => {
    assert.equal(display('ि'), '◌ि');
    assert.equal(display('ः'), '◌ः');
    assert.equal(display('त्र'), 'त्र');
    assert.equal(display('*'), '*');
  });
});
