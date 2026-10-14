import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

import {
  convertXlsx,
  convertCsv,
  parseCsv,
  writeCsv,
  detectDelimiter,
  csvToXlsx,
} from './sheetConvert.js';
import { checkFile, summarize, SHEET_SAVE_AS_MESSAGE, SHEET_DAMAGED_MESSAGE, messageFor } from './docConvert.js';
import { parseXml, attrs, inner, decodeText } from './xmlScan.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

// ---------------------------------------------------------------------------
// A small reader for the converted workbooks: every cell's text, the font of
// its style, and the font of each rich-text run.
// ---------------------------------------------------------------------------

const local = (n) => n.replace(/^.*:/, '');
function* all(node, name) {
  for (const c of node.children) {
    if (local(c.name) === name) yield c;
    yield* all(c, name);
  }
}
const kids = (node, name) => node.children.filter((c) => local(c.name) === name);

function stringOf(xml, node) {
  const runs = kids(node, 'r');
  if (!runs.length) {
    const t = kids(node, 't')[0];
    return { text: t ? decodeText(inner(xml, t)) : '', runs: null };
  }
  const out = runs.map((r) => {
    const rPr = kids(r, 'rPr')[0];
    const rFont = rPr && kids(rPr, 'rFont')[0];
    const t = kids(r, 't')[0];
    return { font: rFont ? attrs(xml, rFont).val : null, text: t ? decodeText(inner(xml, t)) : '' };
  });
  return { text: out.map((r) => r.text).join(''), runs: out };
}

function readBook(bytes) {
  const files = unzipSync(bytes);
  const sx = strFromU8(files['xl/styles.xml']);
  const sroot = parseXml(sx);
  const fontsNode = [...all(sroot, 'fonts')][0];
  const fonts = kids(fontsNode, 'font').map((f) => {
    const n = kids(f, 'name')[0];
    const sz = kids(f, 'sz')[0];
    return { name: n ? attrs(sx, n).val : '', sz: sz ? Number(attrs(sx, sz).val) : null, b: kids(f, 'b').length > 0 };
  });
  const xfs = kids([...all(sroot, 'cellXfs')][0], 'xf').map((x) => Number(attrs(sx, x).fontId ?? 0));
  const sstXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : '';
  const sis = sstXml ? [...all(parseXml(sstXml), 'si')] : [];
  const cells = {};
  for (const name of Object.keys(files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()) {
    const xml = strFromU8(files[name]);
    const sheet = name.match(/([^/]+)\.xml$/)[1];
    for (const c of all(parseXml(xml), 'c')) {
      const a = attrs(xml, c);
      const font = fonts[xfs[Number(a.s ?? 0)]];
      let value;
      if (a.t === 's') value = stringOf(sstXml, sis[Number(inner(xml, kids(c, 'v')[0]))]);
      else if (a.t === 'inlineStr') value = stringOf(xml, kids(c, 'is')[0]);
      else {
        const v = kids(c, 'v')[0];
        const f = kids(c, 'f')[0];
        value = { text: v ? inner(xml, v) : '', formula: f ? inner(xml, f) : null, runs: null };
      }
      cells[`${sheet}!${a.r}`] = { ...value, font: font.name, sz: font.sz, b: font.b };
    }
  }
  return { cells, files };
}

// ---------------------------------------------------------------------------

describe('.xlsx, Kruti Dev -> Unicode', () => {
  for (const name of ['kruti-test.xlsx', 'kruti-test-libreoffice.xlsx']) {
    test(`${name}: only the Kruti Dev cells change, and keep their formatting`, async () => {
      const { bytes, stats } = await convertXlsx(fixture(name), { direction: 'to-unicode' });
      const { cells } = readBook(bytes);
      // Kruti Dev cells: Unicode, in Mangal, bold and size as they were.
      assert.equal(cells['sheet1!B1'].text, 'नाम');
      assert.deepEqual([cells['sheet1!B1'].font, cells['sheet1!B1'].sz, cells['sheet1!B1'].b], ['Mangal', 14, true]);
      assert.equal(cells['sheet1!B2'].text, 'राम कुमार');
      assert.equal(cells['sheet1!B6'].text, 'पुस्तक');
      // DevLys is on the same keyboard: it converts on the Kruti Dev page too.
      assert.equal(cells['sheet1!B5'].text, 'कि');
      assert.equal(cells['sheet1!B5'].font, 'Mangal');
      // The same letters in a Calibri cell are English and are left alone,
      // although the Kruti Dev cells share that very string.
      assert.equal(cells['sheet1!A3'].text, 'jke dqekj');
      assert.equal(cells['sheet2!A1'].text, 'राम कुमार');
      // English, numbers and formulas: untouched.
      assert.equal(cells['sheet1!A2'].text, 'Ram Kumar');
      assert.equal(cells['sheet1!B3'].text, '12345');
      assert.equal(cells['sheet1!C1'].formula, 'B3*2');
      // Rich text: only the Kruti Dev runs change, and they get Mangal.
      const runs = cells['sheet1!B4'].runs;
      assert.equal(cells['sheet1!B4'].text, 'Total: कुल योग दिल्ली');
      assert.equal(runs[0].text, 'Total: ');
      assert.ok(runs.slice(1).every((r) => r.font === 'Mangal'));
      assert.equal(stats.sheets, 2);
      assert.equal(stats.cells, 6);
      assert.ok(stats.convertedChars > 20);
    });
  }

  test('no Kruti Dev font is left in styles.xml', async () => {
    const { bytes } = await convertXlsx(fixture('kruti-test.xlsx'), { direction: 'to-unicode' });
    const sx = strFromU8(unzipSync(bytes)['xl/styles.xml']);
    assert.doesNotMatch(sx, /Kruti|DevLys/);
  });

  test('the note on a cell is kept', async () => {
    const { bytes } = await convertXlsx(fixture('kruti-test.xlsx'), { direction: 'to-unicode' });
    const files = unzipSync(bytes);
    const comments = Object.keys(files).filter((n) => /^xl\/comments/.test(n));
    assert.ok(comments.length);
    assert.match(strFromU8(files[comments[0]]), /note/);
  });

  test('every part not converted is byte for byte the same', async () => {
    const before = unzipSync(fixture('kruti-test.xlsx'));
    const after = unzipSync((await convertXlsx(fixture('kruti-test.xlsx'), { direction: 'to-unicode' })).bytes);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    const changed = Object.keys(before).filter((n) => strFromU8(before[n]) !== strFromU8(after[n]));
    for (const n of changed) assert.match(n, /^xl\/(sharedStrings|styles|worksheets\/sheet\d+|comments\d*)\.xml$/, n);
  });

  test('to another legacy font: DevLys 010', async () => {
    const { bytes } = await convertXlsx(fixture('kruti-test.xlsx'), { direction: { from: 'kruti-dev', to: 'devlys' } });
    const { cells } = readBook(bytes);
    assert.equal(cells['sheet1!B2'].font, 'DevLys 010');
    assert.equal(cells['sheet1!B2'].text, 'jke dqekj');
  });

  test('the Unicode font can be chosen', async () => {
    const { bytes } = await convertXlsx(fixture('kruti-test.xlsx'), { direction: 'to-unicode', unicodeFont: 'Nirmala UI' });
    assert.equal(readBook(bytes).cells['sheet1!B2'].font, 'Nirmala UI');
  });
});

describe('.xlsx, Unicode -> Kruti Dev', () => {
  test('all-Hindi cells get the Kruti Dev font, mixed cells become rich text', async () => {
    const { bytes, stats } = await convertXlsx(fixture('unicode-test.xlsx'), { direction: 'to-kruti' });
    const { cells, files } = readBook(bytes);
    assert.equal(cells['sheet1!A1'].text, 'uke');
    assert.equal(cells['sheet1!A1'].font, 'Kruti Dev 010');
    assert.equal(cells['sheet1!A1'].sz, 12);
    // The red colour of A1 is kept on its new style.
    const fonts = strFromU8(files['xl/styles.xml']).match(/<font>(?:(?!<\/font>)[\s\S])*<\/font>/g);
    assert.ok(fonts.some((f) => f.includes('FF0000') && f.includes('Kruti Dev 010')), 'the red font copied in Kruti Dev');
    assert.equal(cells['sheet1!A2'].text, 'jke dqekj');
    // English stays in the cell's font, the Hindi is set in Kruti Dev.
    const b2 = cells['sheet1!B2'];
    assert.equal(b2.text, 'PAN: ABCDE1234F, irk fnYyh');
    assert.deepEqual(b2.runs.map((r) => r.font), ['Calibri', 'Kruti Dev 010']);
    // Same text, other style (Arial italic 10): its own Kruti Dev style.
    assert.equal(cells['sheet1!C2'].text, 'jke dqekj');
    assert.deepEqual([cells['sheet1!C2'].font, cells['sheet1!C2'].sz], ['Kruti Dev 010', 10]);
    assert.equal(cells['sheet1!A3'].text, 'English only');
    assert.equal(cells['sheet1!A4'].text, '2024');
    assert.equal(stats.cells, 4);
  });
});

describe('.xlsx edge cases', () => {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  /** A minimal workbook, written with the x: prefix some .NET tools use. */
  const prefixed = (cellXml, sst = '') =>
    zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'xl/workbook.xml': strToU8(`<x:workbook xmlns:x="${NS}"/>`),
      'xl/styles.xml': strToU8(
        `<x:styleSheet xmlns:x="${NS}"><x:fonts count="2"><x:font><x:name val="Calibri"/></x:font><x:font><x:sz val="16"/><x:name val="Kruti Dev 010"/><x:charset val="0"/></x:font></x:fonts>` +
          '<x:cellXfs count="2"><x:xf fontId="0"/><x:xf fontId="1" applyFont="1"/></x:cellXfs></x:styleSheet>',
      ),
      ...(sst ? { 'xl/sharedStrings.xml': strToU8(`<x:sst xmlns:x="${NS}" uniqueCount="1">${sst}</x:sst>`) } : {}),
      'xl/worksheets/sheet1.xml': strToU8(`<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1">${cellXml}</x:row></x:sheetData></x:worksheet>`),
    });

  test('prefixed XML (x:si, x:c) converts the same', async () => {
    const book = prefixed('<x:c r="A1" s="1" t="s"><x:v>0</x:v></x:c><x:c r="B1" s="1" t="inlineStr"><x:is><x:t>fnYyh</x:t></x:is></x:c>', '<x:si><x:t>Hkkjr</x:t></x:si>');
    const { bytes } = await convertXlsx(book, { direction: 'to-unicode' });
    const { cells } = readBook(bytes);
    assert.equal(cells['sheet1!A1'].text, 'भारत');
    assert.equal(cells['sheet1!B1'].text, 'दिल्ली');
    assert.equal(cells['sheet1!A1'].font, 'Mangal');
    assert.equal(cells['sheet1!A1'].sz, 16);
  });

  test('a syllable split across two rich-text runs is converted whole', async () => {
    const run = (t, b = '') => `<x:r><x:rPr>${b}<x:rFont val="Kruti Dev 010"/></x:rPr><x:t>${t}</x:t></x:r>`;
    // `f` (ि, typed first) in one run, `d` (क) in the next, bold: still कि.
    const book = prefixed('<x:c r="A1" t="s"><x:v>0</x:v></x:c>', `<x:si>${run('f')}${run('dYyh', '<x:b/>')}</x:si>`);
    const { bytes } = await convertXlsx(book, { direction: 'to-unicode' });
    assert.equal(readBook(bytes).cells['sheet1!A1'].text, 'किल्ली');
  });

  test('Excel _xHHHH_ escapes are read as the character, and a literal one is kept', async () => {
    const book = prefixed('<x:c r="A1" s="1" t="inlineStr"><x:is><x:t>jke_x000D_\nlhrk</x:t></x:is></x:c>');
    const { bytes } = await convertXlsx(book, { direction: 'to-unicode' });
    assert.equal(readBook(bytes).cells['sheet1!A1'].text, 'राम_x000D_\nसीता');
  });

  test('a file that is not a workbook is "damaged", in Excel words', async () => {
    const err = await convertXlsx(strToU8('PK not a zip'), { direction: 'to-unicode' }).catch((e) => e);
    assert.equal(messageFor(err), SHEET_DAMAGED_MESSAGE);
    const docx = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
    assert.equal(messageFor(await convertXlsx(docx, { direction: 'to-unicode' }).catch((e) => e)), SHEET_DAMAGED_MESSAGE);
  });

  test('nothing in a legacy font: nothing changes, and the summary says so', async () => {
    const { stats } = await convertXlsx(fixture('unicode-test.xlsx'), { direction: 'to-unicode' });
    assert.equal(stats.cells, 0);
    assert.ok(summarize(stats, 'to-unicode').warning);
  });
});

describe('checking spreadsheet files', () => {
  const zip = strToU8('PK\x03\x04');
  test('.xlsx, .xlsm and .csv are accepted', () => {
    assert.deepEqual(checkFile({ name: 'a.xlsx', size: 10, head: zip }), { kind: 'xlsx' });
    assert.deepEqual(checkFile({ name: 'a.XLSM', size: 10, head: zip }), { kind: 'xlsx' });
    assert.deepEqual(checkFile({ name: 'a.csv', size: 10 }), { kind: 'csv' });
  });
  test('old .xls and other formats get the Excel Save As message', () => {
    for (const name of ['a.xls', 'a.ods', 'a.xlsb']) assert.deepEqual(checkFile({ name, size: 10 }), { error: SHEET_SAVE_AS_MESSAGE });
  });
  test('a password-protected .xlsx (old container) is told to remove the password', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
    assert.match(checkFile({ name: 'a.xlsx', size: 10, head: ole }).error, /password/);
  });
  test('the summary counts cells and sheets', () => {
    const s = summarize({ cells: 1, sheets: 2, convertedChars: 10, alreadyChars: 0 }, 'to-unicode');
    assert.equal(s.line, 'Converted 1 cell · 2 sheets');
  });
});

describe('.csv', () => {
  test('quoted fields, commas and quotes inside them, CRLF', () => {
    const { rows } = parseCsv('a,"b, c","say ""hi"""\r\n1,,3\r\n');
    assert.deepEqual(rows, [['a', 'b, c', 'say "hi"'], ['1', '', '3']]);
    assert.equal(writeCsv(rows), 'a,"b, c","say ""hi"""\r\n1,,3\r\n');
  });

  test('a line break inside a quoted field stays in the field', () => {
    assert.deepEqual(parseCsv('"a\nb",c').rows, [['a\nb', 'c']]);
  });

  test('the separator: comma, semicolon, tab, and Excel\'s sep= line', () => {
    assert.equal(detectDelimiter('a,b\n1,2\n'), ',');
    assert.equal(detectDelimiter('a;b\n1;2\n'), ';');
    assert.equal(detectDelimiter('a\tb\n1\t2\n'), '\t');
    assert.equal(detectDelimiter('sep=;\na;b\n'), ';');
    // Kruti Dev's ; is the letter य: a comma file full of them is still commas.
    assert.equal(detectDelimiter('uke,dk;Z\njke,;g dk;Z gS\n'), ',');
  });

  test('Kruti Dev -> Unicode: the Hindi fields change, numbers and English stay', () => {
    // Kruti Dev's comma is `]`, and its `,` is the letter ए: ",d fnu" is एक दिन,
    // quoted by Excel because of that comma.
    const csv = 'Name,uke,Amount,Date\r\nRam,"jke] dqekj",1250.50,12-05-2024\r\nRate,",d fnu",500,\r\n';
    const { text, stats } = convertCsv(csv, 'to-unicode');
    assert.equal(text, 'Name,नाम,Amount,Date\r\nRam,"राम, कुमार",1250.50,12-05-2024\r\nRate,एक दिन,500,\r\n');
    assert.equal(stats.cells, 3);
  });

  test('a Kruti Dev " is a letter (\"k is ष), and still converts inside a quoted field', () => {
    const { text } = convertCsv('"Hkk""kk"\r\n', 'to-unicode');
    assert.equal(text, 'भाषा\r\n');
  });

  test('Unicode -> Kruti Dev: only the Hindi part of a mixed field', () => {
    const { text } = convertCsv('नाम,PAN ABCDE1234F पता दिल्ली\r\n', 'to-kruti');
    assert.equal(text, 'uke,PAN ABCDE1234F irk fnYyh\r\n');
  });

  test('the .xlsx made from a CSV sets the font on the Hindi only', () => {
    const csv = 'Name,नाम\r\nPAN ABCDE1234F पता,2024\r\n';
    const out = convertCsv(csv, 'to-kruti');
    const original = parseCsv(csv, out.delimiter).rows;
    const { cells } = readBook(csvToXlsx(out.rows, original, 'to-kruti'));
    assert.equal(cells['sheet1!A1'].font, 'Calibri');
    assert.equal(cells['sheet1!B1'].text, 'uke');
    assert.equal(cells['sheet1!B1'].font, 'Kruti Dev 010');
    assert.deepEqual(cells['sheet1!A2'].runs.map((r) => r.font), ['Calibri', 'Kruti Dev 010']);
    assert.equal(cells['sheet1!B2'].text, '2024');
  });

  test('to Unicode, the .xlsx uses the chosen Unicode font', () => {
    const csv = 'uke,Name\r\n';
    const out = convertCsv(csv, 'to-unicode');
    const { cells } = readBook(csvToXlsx(out.rows, parseCsv(csv).rows, 'to-unicode', { unicodeFont: 'Nirmala UI' }));
    assert.equal(cells['sheet1!A1'].text, 'नाम');
    assert.equal(cells['sheet1!A1'].font, 'Nirmala UI');
    assert.equal(cells['sheet1!B1'].font, 'Calibri');
  });
});
