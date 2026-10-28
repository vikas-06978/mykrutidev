/**
 * The webfonts in public/fonts/ must pass what Chrome's font sanitizer (OTS)
 * checks, or the browser drops the whole font and a page that previews text in
 * it shows the raw legacy keys ("Hkkjr") instead of Hindi.
 *
 * Ajay, Aman and Ruchi shipped that way: a cmap `language` of 1 in every
 * subtable, and (Ruchi) a kern entry selector that disagreed with its pair
 * count. Found by loading every page in Chromium: "Failed to decode downloaded
 * font". scripts/webfont.mjs holds the check and the byte-level repair.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { problems, readFont, repair, writeWoff } from '../../scripts/webfont.mjs';

const DIR = fileURLToPath(new URL('../../public/fonts/', import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.woff'));
const load = (f) => readFileSync(DIR + f);

describe('public/fonts', () => {
  test('there are fonts to check', () => {
    assert.ok(FILES.length >= 30, `only ${FILES.length} .woff files found`);
  });

  for (const f of FILES) {
    test(`${f} passes the checks Chrome's sanitizer makes`, () => {
      assert.deepEqual(problems(load(f)), []);
    });
  }
});

describe('the repair', () => {
  /** A good font with Ajay's and Ruchi's mistakes put back in. */
  function broken() {
    const font = readFont(load('ruchi.woff'));
    const cmap = font.tables.find((t) => t.tag === 'cmap').data;
    for (let i = 0; i < cmap.readUInt16BE(2); i++) {
      const at = cmap.readUInt32BE(8 + i * 8);
      cmap.writeUInt16BE(1, at + 4); // language 1
    }
    const kern = font.tables.find((t) => t.tag === 'kern').data;
    kern.writeUInt16BE(7, 4 + 10); // an entry selector no pair count can have
    return writeWoff(font);
  }

  test('the check sees both mistakes', () => {
    const issues = problems(broken());
    assert.ok(issues.some((i) => /cmap: .* has language 1, not 0/.test(i)), issues.join('\n'));
    assert.ok(issues.some((i) => /kern: entry selector/.test(i)), issues.join('\n'));
  });

  test('it fixes them and touches nothing else', () => {
    const before = broken();
    const after = repair(before);
    assert.deepEqual(problems(after), []);
    const a = readFont(before).tables;
    const b = readFont(after).tables;
    assert.deepEqual(a.map((t) => t.tag), b.map((t) => t.tag));
    const changed = a.filter((t, i) => !t.data.equals(b[i].data)).map((t) => t.tag).sort();
    // cmap: the language fields; kern: the entry selector; head: at most the whole-file checksum
    assert.ok(changed.includes('cmap') && changed.includes('kern'), changed.join());
    assert.deepEqual(changed.filter((t) => t !== 'head'), ['cmap', 'kern']);
    const glyphs = (t) => t.find((x) => x.tag === 'glyf').data;
    assert.ok(glyphs(a).equals(glyphs(b)), 'glyph outlines must be byte for byte the same');
  });

  test('a font that is already fine comes back with the same tables', () => {
    const good = load('krishna.woff');
    const again = readFont(repair(good)).tables;
    readFont(good).tables.forEach((t, i) => {
      if (t.tag !== 'head') assert.ok(t.data.equals(again[i].data), `${t.tag} changed`);
    });
  });
});
