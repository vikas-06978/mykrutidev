import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { examplesFor, limitsFor, phrasesFor, MIN_ROWS, PHRASES } from './converterExamples.js';
import { convert, unmappedChars } from './fontMaps.js';
import { PAGES, isLive } from './routes.js';
import { isUnicodeKey } from './wordFonts.js';

const C = (t, f, to) => {
  const r = convert(t, f, to);
  return typeof r === 'string' ? r : r.text;
};
const independent = JSON.parse(readFileSync(new URL('./__fixtures__/independent-kruti-dev.json', import.meta.url), 'utf8'));
const converterPages = PAGES.filter((p) => p.from && p.to && isLive(p));

describe('worked examples: every live converter page', () => {
  test('there are converter pages to check', () => {
    assert.ok(converterPages.length >= 70, `${converterPages.length} pages`);
  });

  for (const p of converterPages) {
    test(`${p.path} shows only rows that check out`, () => {
      const rows = examplesFor(p.from, p.to);
      assert.ok(rows, `${p.path}: fewer than ${MIN_ROWS} rows passed`);
      assert.ok(rows.length >= MIN_ROWS);
      for (const r of rows) {
        // legacy sides read back as the phrase they came from
        if (!isUnicodeKey(p.from)) assert.equal(C(r.source, p.from, 'unicode'), r.unicode, `${p.from} source of "${r.unicode}"`);
        else assert.equal(r.source, r.unicode);
        if (!isUnicodeKey(p.to)) assert.equal(C(r.result, p.to, 'unicode'), r.unicode, `${p.to} result of "${r.unicode}"`);
        else assert.equal(r.result, r.unicode);
        // and the page's own direction gives exactly the row's result
        assert.equal(C(r.source, p.from, p.to), r.result, `${p.path}: "${r.unicode}"`);
        assert.notEqual(r.source.trim(), '');
        assert.notEqual(r.result.trim(), '');
      }
    });
  }

  test('a font nobody has heard of gets no block rather than a guess', () => {
    assert.equal(examplesFor('no-such-font', 'unicode'), null);
    assert.equal(examplesFor('unicode', 'no-such-font'), null);
  });

  test('the phrase lists have five phrases each, in the script of their page', () => {
    for (const [script, list] of Object.entries(PHRASES)) {
      assert.equal(list.length, 5, script);
      for (const { text } of list) assert.ok(text.length > 1, text);
    }
    assert.equal(phrasesFor('kruti-dev', 'unicode'), PHRASES.deva);
    assert.equal(phrasesFor('terafont', 'unicode'), PHRASES.gu);
    assert.equal(phrasesFor('bamini', 'unicode'), PHRASES.ta);
    assert.equal(phrasesFor('sutonny', 'unicode'), PHRASES.bn);
    assert.equal(phrasesFor('dvtt', 'unicode'), PHRASES.mr);
    assert.equal(phrasesFor('preeti', 'unicode'), PHRASES.ne);
  });
});

describe('Kruti Dev and DevLys examples match keys typed from the keyboard rules, not from the code', () => {
  const want = independent.examples;

  for (const [from, to] of [
    ['kruti-dev', 'unicode'], ['unicode', 'kruti-dev'], ['kruti-dev', 'mangal'], ['mangal', 'kruti-dev'],
    ['devlys', 'unicode'], ['unicode', 'devlys'], ['devlys', 'mangal'], ['mangal', 'devlys'],
  ]) {
    test(`${from} -> ${to}`, () => {
      const rows = examplesFor(from, to);
      assert.equal(rows.length, want.length, 'all five rows survive');
      rows.forEach((r, i) => {
        assert.equal(r.unicode, want[i].u);
        const legacy = isUnicodeKey(from) ? r.result : r.source;
        assert.equal(legacy, want[i].k, want[i].why);
      });
    });
  }

  test('a wider set of independent pairs also converts exactly, both ways', () => {
    for (const { k, u } of independent.words) {
      assert.equal(C(k, 'kruti-dev', 'unicode'), u, `Kruti Dev ${JSON.stringify(k)}`);
      assert.equal(C(C(u, 'unicode', 'kruti-dev'), 'kruti-dev', 'unicode'), u, `round trip of ${u}`);
    }
    for (const { k, u } of independent.english_kept) assert.equal(C(k, 'kruti-dev', 'unicode'), u, k);
  });
});

describe('"Good to know" says only what the code does', () => {
  test('the colon rule: a Kruti-keyboard font to Unicode and back', () => {
    assert.equal(limitsFor('kruti-dev', 'unicode').colon, 'toUnicode');
    assert.equal(limitsFor('devlys', 'mangal').colon, 'toUnicode');
    assert.equal(limitsFor('arjun', 'unicode').colon, 'toUnicode');
    assert.equal(limitsFor('unicode', 'kruti-dev').colon, 'fromUnicode');
    assert.equal(limitsFor('kruti-dev', 'devlys').colon, null, 'font to font: the visarga key passes through unchanged');
    assert.equal(limitsFor('himalaya', 'unicode').colon, null, 'a different keyboard');
    assert.equal(limitsFor('bamini', 'unicode').colon, null);
  });

  test('the colon rule is really what the converter does', () => {
    const toKruti = C('विषय: अवकाश', 'unicode', 'kruti-dev');
    assert.ok(toKruti.startsWith('fo"k;%'), `a colon is typed with the visarga key: ${toKruti}`);
    const back = C('fo"k;% vodk\'k', 'kruti-dev', 'unicode');
    assert.ok(back.startsWith('विषयः'), 'and comes back as the visarga U+0903');
    assert.ok(C('fo"k;:', 'kruti-dev', 'unicode').endsWith('रू'), 'the colon key itself draws रू');
  });

  test('the unmapped list is letters the output font really cannot type', () => {
    const { unmapped } = limitsFor('unicode', 'himalaya');
    assert.ok(unmapped.includes('़'), 'Himalaya has no nukta key');
    for (const c of unmapped) assert.ok(unmappedChars(c, 'himalaya').includes(c), `${c} is flagged by the converter too`);
    assert.deepEqual(limitsFor('unicode', 'kruti-dev').unmapped, []);
    assert.deepEqual(limitsFor('kruti-dev', 'unicode').unmapped, [], 'Unicode output needs no list');
    assert.deepEqual(limitsFor('unicode', 'bamini').unmapped, [], 'only Devanagari output is probed');
  });
});
