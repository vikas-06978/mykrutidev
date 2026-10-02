// Legacy <-> legacy pages. They add no mapping of their own: convert() goes
// through Unicode, so each page is exactly as good as its two verified halves.
// These tests pin that, over the whole Kruti Dev ground-truth fixture.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convert, unmappedChars } from './fontMaps.js';
import { PAGES, isLive, reversePage } from './routes.js';
import fixture from './__fixtures__/kruti-dev.json' with { type: 'json' };

const CASES = Object.entries(fixture)
  .filter(([k]) => !k.startsWith('_'))
  .flatMap(([, list]) => list);

// Abbasi Chanakya New has no straight quote keys (' and " are letters there),
// so it writes curly ones, and it draws its digits in Latin form, so २ comes
// back as 2. Neither a quote's shape nor a digit's script is a letter.
const quotes = (s) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/''/g, '"')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));

const LEGACY_PAIRS = PAGES.filter(
  (p) => p.kind === 'converter' && isLive(p) && p.from && p.to &&
    ['kruti-dev', 'devlys', 'abbasi-chanakya'].includes(p.from) &&
    ['kruti-dev', 'devlys', 'abbasi-chanakya', 'mangal'].includes(p.to) &&
    p.from !== p.to,
);

describe('legacy <-> legacy converter pages', () => {
  test('all eight are live and have a live reverse page', () => {
    const paths = [
      '/kruti-dev-to-devlys', '/devlys-to-kruti-dev',
      '/kruti-dev-to-abbasi-chanakya', '/abbasi-chanakya-to-kruti-dev',
      '/devlys-to-abbasi-chanakya', '/abbasi-chanakya-to-devlys',
      '/mangal-to-abbasi-chanakya', '/abbasi-chanakya-to-mangal',
    ];
    for (const path of paths) {
      const p = PAGES.find((x) => x.path === path);
      assert.ok(p && isLive(p), path);
      const rev = reversePage(p);
      assert.ok(rev && isLive(rev), `${path} has no live reverse`);
    }
  });

  test('every pair with Abbasi Chanakya carries its Beta badge', () => {
    for (const p of PAGES) {
      if (p.kind === 'converter' && (p.from === 'abbasi-chanakya' || p.to === 'abbasi-chanakya')) {
        assert.equal(p.beta, true, p.path);
      }
    }
  });

  test('each pair says the same Hindi as going through Unicode by hand', () => {
    assert.ok(LEGACY_PAIRS.length >= 4);
    for (const { k, u } of CASES) {
      // Every source font gets the same Hindi, written in its own keys.
      for (const from of ['kruti-dev', 'devlys', 'abbasi-chanakya']) {
        const src = convert(u, 'unicode', from, { keepEnglish: false });
        for (const to of ['kruti-dev', 'devlys', 'abbasi-chanakya']) {
          if (from === to) continue;
          const out = convert(src, from, to, { keepEnglish: false });
          assert.equal(
            quotes(convert(out, to, 'unicode', { keepEnglish: false })),
            quotes(convert(src, from, 'unicode', { keepEnglish: false })),
            `${from} -> ${to}: ${JSON.stringify(k)} (${u})`,
          );
        }
      }
    }
  });

  test('Kruti Dev and DevLys share their keys: text passes through byte for byte', () => {
    // Including the non-canonical spellings and both quote slots (Þ ß), which
    // a trip through Unicode would fold together.
    for (const { k } of CASES) {
      assert.equal(convert(k, 'kruti-dev', 'devlys', { keepEnglish: false }), k, k);
      assert.equal(convert(k, 'devlys', 'kruti-dev', { keepEnglish: false }), k, k);
    }
  });

  test('the keys that differ are rewritten, in both directions', () => {
    const pairs = [
      ['Hkkjr', 'Òkjr'], // भारत
      ['iz/kkuea=h', 'ç/kkuea=h'], // प्रधानमंत्री
      ['flag', 'Çlg'], // सिंह
    ];
    for (const [kruti, abbasi] of pairs) {
      assert.equal(convert(kruti, 'kruti-dev', 'abbasi-chanakya'), abbasi);
      assert.equal(convert(abbasi, 'abbasi-chanakya', 'kruti-dev'), kruti);
      assert.equal(convert(kruti, 'devlys', 'abbasi-chanakya'), abbasi);
      assert.equal(convert(abbasi, 'abbasi-chanakya', 'devlys'), kruti);
    }
  });

  test('the unmapped warning reads the Hindi, not the raw keys', () => {
    // The Converter passes Unicode for a legacy source. Raw Kruti keys would
    // otherwise be judged as if they were Hindi.
    const hindi = convert('Hkkjr', 'kruti-dev', 'unicode');
    assert.deepEqual(unmappedChars(hindi, 'abbasi-chanakya'), []);
    assert.deepEqual(unmappedChars('ॐ', 'abbasi-chanakya'), ['ॐ']);
  });
});
