import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';

// The browser has DOMParser; Node does not. docConvert.js uses it for the
// parts it only reads ([Content_Types].xml, the theme).
globalThis.DOMParser ??= DOMParser;

import {
  checkFile,
  convertDocx,
  convertTxt,
  decodeTextFile,
  outputName,
  rewriteRPr,
  splitScripts,
  splitsSyllable,
  summarize,
  SAVE_AS_MESSAGE,
  PDF_MESSAGE,
  DAMAGED_MESSAGE,
  GENERIC_MESSAGE,
  UserError,
  messageFor,
  KRUTI_FONT,
} from './docConvert.js';
import { buildDocxBytes } from './docx.js';
import { parseXml, descendants, inner, decodeText, attrs, child } from './xmlScan.js';

// ---------------------------------------------------------------------------
// Fixture builder: a real, minimal .docx made in the test
// ---------------------------------------------------------------------------

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS =
  `${W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml"';

const KRUTI = '<w:rFonts w:ascii="Kruti Dev 010" w:hAnsi="Kruti Dev 010"/>';
const ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>';

/** A run: `r(KRUTI, 'Hkkjr')`, optionally with extra rPr children. */
const r = (fonts, text, extra = '') =>
  `<w:r w:rsidR="00A1"><w:rPr>${fonts}${extra}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const body = (inner_) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${inner_}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;

const DEFAULT_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

function makeDocx({ document, styles = DEFAULT_STYLES, headers = [], footers = [], footnotes }) {
  const overrides = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    ...headers.map((_, k) => `<Override PartName="/word/header${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`),
    ...footers.map((_, k) => `<Override PartName="/word/footer${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`),
    ...(footnotes ? ['<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'] : []),
  ];
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${overrides.join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'word/media/image1.png': PNG,
  };
  headers.forEach((h, k) => {
    files[`word/header${k + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${h}</w:hdr>`);
  });
  footers.forEach((f, k) => {
    files[`word/footer${k + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${f}</w:ftr>`);
  });
  if (footnotes) {
    files['word/footnotes.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W}>${footnotes}</w:footnotes>`);
  }
  return zipSync(files);
}

/** Convert and return every part as a string, plus the stats. */
async function run(bytes, direction, opts = {}) {
  const { bytes: out, stats } = await convertDocx(bytes, { direction, ...opts });
  const files = unzipSync(out);
  const text = (name) => strFromU8(files[name]);
  return { files, text, stats, out };
}

/** Each paragraph's runs as [text, ascii font]. */
function runsOf(xml) {
  const root = parseXml(xml);
  return [...descendants(root, 'w:p')].map((pNode) =>
    pNode.children
      .filter((c) => c.name === 'w:r')
      .map((rNode) => {
        const t = rNode.children.filter((c) => c.name === 'w:t').map((c) => decodeText(inner(xml, c))).join('');
        const rPr = child(rNode, 'w:rPr');
        const f = rPr && child(rPr, 'w:rFonts');
        return [t, f ? attrs(xml, f)['w:ascii'] : undefined];
      }),
  );
}

/** All the text of a part, paragraph by paragraph. */
const textOf = (xml) => runsOf(xml).map((runs) => runs.map(([t]) => t).join(''));

// ---------------------------------------------------------------------------
// 1. Only the Kruti paragraph changes
// ---------------------------------------------------------------------------

describe('Kruti Dev -> Unicode', () => {
  test('1. a Kruti paragraph converts; an Arial paragraph is left byte-for-byte', async () => {
    const englishPara = p(r(ARIAL, 'Hello world'));
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr')) + englishPara) });
    const { text, stats } = await run(doc, 'to-unicode');
    const xml = text('word/document.xml');

    assert.deepEqual(runsOf(xml), [[['भारत', 'Mangal']], [['Hello world', 'Arial']]]);
    assert.ok(xml.includes(englishPara), 'the English paragraph must be byte-identical');
    assert.match(xml, /<w:rFonts w:ascii="Mangal" w:hAnsi="Mangal" w:cs="Mangal"\/>/);
    assert.equal(stats.paragraphs, 1);
  });

  test('the output font can be Nirmala UI instead', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))) });
    const { text } = await run(doc, 'to-unicode', { unicodeFont: 'Nirmala UI' });
    assert.deepEqual(runsOf(text('word/document.xml')), [[['भारत', 'Nirmala UI']]]);
  });

  // -------------------------------------------------------------------------
  // 2. Split syllables
  // -------------------------------------------------------------------------

  test('2. f in one run and d in the next is कि', async () => {
    const doc = makeDocx({
      document: body(p(r(KRUTI, 'f'), '<w:proofErr w:type="spellStart"/>', r(KRUTI, 'd'))),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['कि']);
  });

  test('a reph split into the next run still lands in front: de + Z is कर्म', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'de'), r(KRUTI, 'Z'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['कर्म']);
  });

  test('a split syllable merges even across a formatting change', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'f', '<w:b/>'), r(KRUTI, 'd'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['कि']);
  });

  test('a bold word inside a Kruti paragraph stays bold', async () => {
    const doc = makeDocx({
      document: body(p(r(KRUTI, 'Hkkjr '), r(KRUTI, 'gS', '<w:b/>'), r(KRUTI, 'A'))),
    });
    const { text } = await run(doc, 'to-unicode');
    const xml = text('word/document.xml');
    assert.deepEqual(runsOf(xml)[0].map(([t]) => t), ['भारत ', 'है', '।']);
    const boldRun = [...descendants(parseXml(xml), 'w:r')][1];
    assert.match(xml.slice(boldRun.start, boldRun.end), /<w:b\/><w:bCs\/>/);
  });

  test('runs split only by spell-check language are merged into one', async () => {
    const doc = makeDocx({
      document: body(p(r(KRUTI, 'Hkk', '<w:lang w:val="en-US"/>'), r(KRUTI, 'jr'))),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(runsOf(text('word/document.xml')), [[['भारत', 'Mangal']]]);
  });

  // -------------------------------------------------------------------------
  // 3. Tables, headers, footers, footnotes, text boxes
  // -------------------------------------------------------------------------

  test('3. table cells, header and footer are all converted; tables are counted', async () => {
    const table =
      '<w:tbl><w:tblPr/><w:tr>' +
      `<w:tc><w:p>${r(KRUTI, 'Hkkjr')}</w:p></w:tc>` +
      `<w:tc><w:p>${r(ARIAL, 'India')}</w:p></w:tc>` +
      '</w:tr></w:tbl>';
    const doc = makeDocx({
      document: body(table),
      headers: [p(r(KRUTI, 'fgUnh'))],
      footers: [p(r(KRUTI, 'ist'))],
    });
    const { text, stats } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['भारत', 'India']);
    assert.deepEqual(textOf(text('word/header1.xml')), ['हिन्दी']);
    assert.deepEqual(textOf(text('word/footer1.xml')), ['पेज']);
    assert.equal(stats.tables, 1);
    assert.equal(stats.paragraphs, 3);
  });

  test('footnotes are converted too', async () => {
    const doc = makeDocx({
      document: body(p(r(ARIAL, 'x'))),
      footnotes: `<w:footnote w:id="1">${p(r(KRUTI, 'Hkkjr'))}</w:footnote>`,
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/footnotes.xml')), ['भारत']);
  });

  test('text boxes: both the modern and the fallback copy are converted', async () => {
    const box = `<w:txbxContent>${p(r(KRUTI, 'Hkkjr'))}</w:txbxContent>`;
    const drawing =
      '<w:r><w:rPr>' + KRUTI + '</w:rPr><mc:AlternateContent>' +
      `<mc:Choice Requires="wps"><w:drawing><wps:txbx>${box}</wps:txbx></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><v:textbox>${box}</v:textbox></w:pict></mc:Fallback>` +
      '</mc:AlternateContent></w:r>';
    const doc = makeDocx({ document: body(p(r(KRUTI, 'fgUnh'), drawing)) });
    const { text } = await run(doc, 'to-unicode');
    const xml = text('word/document.xml');
    const all = textOf(xml);
    assert.equal(all.filter((t) => t === 'भारत').length, 2, 'both copies of the text box');
    assert.ok(all[0].startsWith('हिन्दी'), 'and the paragraph around it');
    assert.equal((xml.match(/<mc:AlternateContent>/g) || []).length, 1, 'the drawing is kept');
  });

  // -------------------------------------------------------------------------
  // 4. Inherited fonts
  // -------------------------------------------------------------------------

  test('4. a font inherited from the paragraph style is detected', async () => {
    const styles = DEFAULT_STYLES.replace(
      '</w:styles>',
      `<w:style w:type="paragraph" w:styleId="KrutiBody"><w:basedOn w:val="Normal"/><w:rPr>${KRUTI}</w:rPr></w:style></w:styles>`,
    );
    const doc = makeDocx({
      styles,
      document: body(
        '<w:p><w:pPr><w:pStyle w:val="KrutiBody"/></w:pPr><w:r><w:t>Hkkjr</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>',
      ),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(runsOf(text('word/document.xml')), [[['भारत', 'Mangal']], [['Hello', undefined]]]);
  });

  test('a font from a style it is based on, a character style, or docDefaults', async () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}>
      <w:docDefaults><w:rPrDefault><w:rPr>${KRUTI}</w:rPr></w:rPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"/>
      <w:style w:type="paragraph" w:styleId="English"><w:rPr>${ARIAL}</w:rPr></w:style>
      <w:style w:type="character" w:styleId="KrutiChar"><w:rPr><w:rFonts w:ascii="KrutiDev 040"/></w:rPr></w:style>
    </w:styles>`;
    const doc = makeDocx({
      styles,
      document: body(
        '<w:p><w:r><w:t>Hkkjr</w:t></w:r></w:p>' + // docDefaults
          '<w:p><w:pPr><w:pStyle w:val="English"/></w:pPr><w:r><w:t>Hello</w:t></w:r>' +
          '<w:r><w:rPr><w:rStyle w:val="KrutiChar"/></w:rPr><w:t>gS</w:t></w:r></w:p>',
      ),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['भारत', 'Helloहै']);
  });

  // -------------------------------------------------------------------------
  // Byte-for-byte
  // -------------------------------------------------------------------------

  test('every part that holds no converted text is copied byte for byte', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))) });
    const before = unzipSync(doc);
    const { files } = await run(doc, 'to-unicode');
    assert.deepEqual(Object.keys(files), Object.keys(before), 'same entries, same order');
    for (const name of ['word/styles.xml', 'word/media/image1.png', '_rels/.rels', '[Content_Types].xml']) {
      assert.deepEqual(files[name], before[name], name);
    }
  });

  test('inside the document, everything outside the converted runs is unchanged', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))) });
    const original = strFromU8(unzipSync(doc)['word/document.xml']);
    const { text } = await run(doc, 'to-unicode');
    const xml = text('word/document.xml');
    const runStart = original.indexOf('<w:r ');
    const runEnd = original.indexOf('</w:r>') + 6;
    assert.equal(xml.slice(0, runStart), original.slice(0, runStart));
    assert.ok(xml.endsWith(original.slice(runEnd)));
  });

  test('a document with no Kruti text is returned unchanged, with a warning', async () => {
    const doc = makeDocx({ document: body(p(r(ARIAL, 'Hello'))) });
    const before = unzipSync(doc);
    const { files, stats } = await run(doc, 'to-unicode');
    assert.deepEqual(files['word/document.xml'], before['word/document.xml']);
    assert.equal(
      summarize(stats, 'to-unicode').warning,
      'No Kruti Dev text found in this document. Is it already Unicode?',
    );
  });

  test('characters that need escaping survive: < is ढ, & is a hyphen, " is ष्', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, '&lt;ksy'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['ढोल']);
  });
});

// ---------------------------------------------------------------------------
// 5 and 6. Unicode -> Kruti Dev
// ---------------------------------------------------------------------------

describe('Unicode -> Kruti Dev', () => {
  test('5. "Hello हिन्दी" is split: English stays Arial, Hindi becomes Kruti Dev 010', async () => {
    const doc = makeDocx({ document: body(p(r(ARIAL, 'Hello हिन्दी'))) });
    const { text } = await run(doc, 'to-kruti');
    assert.deepEqual(runsOf(text('word/document.xml')), [[['Hello ', 'Arial'], ['fgUnh', KRUTI_FONT]]]);
  });

  test('an English-only run is left byte-for-byte', async () => {
    const english = r(ARIAL, 'Only English 2024');
    const doc = makeDocx({ document: body(p(english, r(ARIAL, 'भारत'))) });
    const { text } = await run(doc, 'to-kruti');
    assert.ok(text('word/document.xml').includes(english));
  });

  test('szCs and bCs carry over to the Kruti run, which Word sizes with sz and b', async () => {
    const doc = makeDocx({ document: body(p(r(ARIAL, 'भारत', '<w:bCs/><w:szCs w:val="32"/>'))) });
    const { text } = await run(doc, 'to-kruti');
    const xml = text('word/document.xml');
    assert.match(xml, /<w:b\/><w:bCs\/>.*<w:sz w:val="32"\/><w:szCs w:val="32"\/>/);
  });

  test('6. round trip: Unicode -> Kruti -> Unicode gives the same text', async () => {
    const paras = [
      'हिन्दी भारत की राजधानी भाषा है।',
      'Hello हिन्दी, PAN 2024',
      'कृपया प्रश्न पत्र देखें।',
      'क्षेत्रीय कार्यालय',
    ];
    const doc = makeDocx({ document: body(paras.map((t) => p(r(ARIAL, t))).join('')) });
    const kruti = await run(doc, 'to-kruti');
    const back = await run(kruti.out, 'to-unicode');
    assert.deepEqual(textOf(back.text('word/document.xml')), paras);
  });
});

// ---------------------------------------------------------------------------
// Run properties
// ---------------------------------------------------------------------------

describe('rewriteRPr', () => {
  test('keeps schema order: rStyle, rFonts, b, bCs, ..., sz, szCs, ..., lang', () => {
    const out = rewriteRPr(
      '<w:rPr><w:lang w:val="hi-IN"/><w:sz w:val="28"/><w:b/><w:rStyle w:val="X"/><w:rFonts w:ascii="Kruti Dev 010" w:eastAsia="SimSun" w:hint="eastAsia"/></w:rPr>',
      'Mangal',
      'to-unicode',
    );
    assert.equal(
      out,
      '<w:rPr><w:rStyle w:val="X"/><w:rFonts w:ascii="Mangal" w:hAnsi="Mangal" w:cs="Mangal" w:eastAsia="SimSun"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="hi-IN"/></w:rPr>',
    );
  });

  test('a run with no properties gets them', () => {
    assert.equal(rewriteRPr('', 'Mangal', 'to-unicode'), '<w:rPr><w:rFonts w:ascii="Mangal" w:hAnsi="Mangal" w:cs="Mangal"/></w:rPr>');
  });
});

// ---------------------------------------------------------------------------
// 7. Files that are not supported
// ---------------------------------------------------------------------------

describe('checking the file', () => {
  test('7. .doc gets the Save As message, .pdf the open-it-in-Word steps', () => {
    for (const name of ['order.doc', 'order.rtf', 'order.odt', 'order.wps']) {
      assert.deepEqual(checkFile({ name, size: 1000 }), { error: SAVE_AS_MESSAGE }, name);
    }
    assert.deepEqual(checkFile({ name: 'order.PDF', size: 1000 }), { error: PDF_MESSAGE });
    assert.match(PDF_MESSAGE, /Open the PDF in Word/);
  });

  test('a .doc or .pdf renamed to .docx is caught by its first bytes', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    assert.match(checkFile({ name: 'a.docx', size: 10, head: ole }).error, /Save As/);
    const pdf = strToU8('%PDF-1.7');
    assert.deepEqual(checkFile({ name: 'a.docx', size: 10, head: pdf }), { error: PDF_MESSAGE });
  });

  test('a .docx that is not a zip is "damaged", never "save as .docx"', () => {
    assert.deepEqual(checkFile({ name: 'a.docx', size: 10, head: strToU8('hello') }), { error: DAMAGED_MESSAGE });
  });

  test('.docx and .txt are accepted (.xlsx and .csv: sheetConvert.test.js); anything else is not', () => {
    assert.deepEqual(checkFile({ name: 'a.docx', size: 10, head: strToU8('PK\x03\x04') }), { kind: 'docx' });
    assert.deepEqual(checkFile({ name: 'a.TXT', size: 10 }), { kind: 'txt' });
    assert.ok(checkFile({ name: 'a.pptx', size: 10 }).error);
  });

  test('over 20 MB is refused', () => {
    assert.match(checkFile({ name: 'a.docx', size: 20 * 1024 * 1024 + 1 }).error, /20 MB/);
  });

  test('a corrupt .docx fails with the "damaged" message, not a crash', async () => {
    const err = await convertDocx(strToU8('PK not really a zip'), { direction: 'to-unicode' }).catch((e) => e);
    assert.ok(err instanceof UserError);
    assert.equal(messageFor(err), DAMAGED_MESSAGE);
    assert.ok(err.cause, 'the real error is kept for console.error');
  });

  test('a .docx with broken XML inside is "damaged"', async () => {
    const bytes = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))).replace('</w:body>', '') });
    const err = await convertDocx(bytes, { direction: 'to-unicode' }).catch((e) => e);
    assert.equal(messageFor(err), DAMAGED_MESSAGE);
  });

  test('anything unexpected gets the generic message, never "save as .docx"', () => {
    assert.equal(messageFor(new TypeError('x is undefined')), GENERIC_MESSAGE);
    assert.doesNotMatch(GENERIC_MESSAGE, /\.docx/);
    assert.doesNotMatch(DAMAGED_MESSAGE, /\.docx/);
  });

  test('output file names', () => {
    assert.equal(outputName('Order 12.docx', 'to-unicode', 'docx'), 'Order 12-unicode.docx');
    assert.equal(outputName('notes.txt', 'to-kruti', 'txt'), 'notes-krutidev.txt');
  });
});

// ---------------------------------------------------------------------------
// .txt
// ---------------------------------------------------------------------------

describe('.txt files', () => {
  test('Kruti -> Unicode converts the whole text', () => {
    assert.equal(convertTxt('Hkkjr\nfgUnh', 'to-unicode').text, 'भारत\nहिन्दी');
  });

  test('Unicode -> Kruti converts only the Devanagari', () => {
    assert.equal(convertTxt('Hello हिन्दी, PAN', 'to-kruti').text, 'Hello fgUnh] PAN');
  });

  test('an ANSI (Windows-1252) Kruti file is read correctly', () => {
    // "jk"Vª" - ª is the single byte 0xAA in Windows-1252, invalid as UTF-8.
    const ansi = new Uint8Array([0x6a, 0x6b, 0x22, 0x56, 0xaa]);
    const { text, encoding } = decodeTextFile(ansi);
    assert.equal(encoding, 'windows-1252');
    assert.equal(convertTxt(text, 'to-unicode').text, 'राष्ट्र');
  });

  test('UTF-8 with a BOM, and UTF-16', () => {
    assert.equal(decodeTextFile(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8('भारत')])).text, 'भारत');
    const u16 = new Uint8Array([0xff, 0xfe, 0x2d, 0x09]);
    assert.equal(decodeTextFile(u16).text, 'भ');
  });

  test('the .docx offered for a Kruti .txt has Kruti Dev 010 on the Hindi only', async () => {
    const unicode = buildDocxBytes('Hello हिन्दी', { fontName: 'Mangal' });
    const { text } = await run(unicode, 'to-kruti');
    assert.deepEqual(runsOf(text('word/document.xml')), [[['Hello ', 'Mangal'], ['fgUnh', KRUTI_FONT]]]);
  });
});

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

describe('helpers', () => {
  test('splitScripts attaches spaces and punctuation to their neighbour', () => {
    assert.deepEqual(splitScripts('Hello हिन्दी'), [{ hindi: false, s: 'Hello ' }, { hindi: true, s: 'हिन्दी' }]);
    assert.deepEqual(splitScripts('हिन्दी, PAN'), [{ hindi: true, s: 'हिन्दी, ' }, { hindi: false, s: 'PAN' }]);
    assert.deepEqual(splitScripts('  भारत'), [{ hindi: true, s: '  भारत' }]);
  });

  test('splitsSyllable', () => {
    assert.equal(splitsSyllable('f', 'd'), true);
    assert.equal(splitsSyllable('de', 'Z'), true);
    assert.equal(splitsSyllable('Hk', 'kjr'), true); // ा
    assert.equal(splitsSyllable('Hkkjr ', 'gS'), false);
  });

  test('summary wording', () => {
    assert.deepEqual(
      summarize({ paragraphs: 1245, tables: 3, convertedChars: 98, alreadyChars: 2 }, 'to-unicode'),
      {
        line: 'Converted 1,245 paragraphs · 3 tables',
        share: '98% of the Hindi text was in Kruti Dev and has been converted. 2% was already Unicode and was left as it is.',
        warning: null,
      },
    );
    assert.equal(summarize({ paragraphs: 1, tables: 0, convertedChars: 5, alreadyChars: 0 }, 'to-unicode').share, 'All Hindi text converted.');
    assert.equal(summarize({ paragraphs: 1, tables: 0, convertedChars: 5, alreadyChars: 0 }, 'to-unicode').line, 'Converted 1 paragraph');
    assert.match(summarize({ paragraphs: 0, tables: 0, convertedChars: 0, alreadyChars: 0 }, 'to-kruti').warning, /No Unicode Hindi/);
  });
});

// ---------------------------------------------------------------------------
// Real Word files: __fixtures__/kruti-test.docx and unicode-test.docx.
// Single-quoted XML declarations, theme fonts in docDefaults, a paragraph
// whose font comes from a style, header, footer, numbering, customXml and a
// thumbnail.
// ---------------------------------------------------------------------------

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const fixture = (name) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const TEXT_PARTS = ['word/header1.xml', 'word/document.xml', 'word/footer1.xml'];

/**
 * Every paragraph of a part as runs, read back with a real XML parser - so
 * this also proves the written XML is well formed.
 * @returns {{ text: string, runs: { t: string, font: string | null, bold: boolean }[] }[]}
 */
function readParas(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const on = (el) => !!el && !['0', 'false'].includes(el.getAttributeNS(NS_W, 'val'));
  return Array.from(doc.getElementsByTagNameNS(NS_W, 'p')).map((para) => {
    const runs = Array.from(para.getElementsByTagNameNS(NS_W, 'r')).map((run) => {
      const rPr = run.getElementsByTagNameNS(NS_W, 'rPr')[0];
      return {
        t: Array.from(run.getElementsByTagNameNS(NS_W, 't')).map((t) => t.textContent).join(''),
        font: rPr?.getElementsByTagNameNS(NS_W, 'rFonts')[0]?.getAttributeNS(NS_W, 'ascii') ?? null,
        bold: on(rPr?.getElementsByTagNameNS(NS_W, 'b')[0]),
      };
    });
    return { text: runs.map((x) => x.t).join(''), runs };
  });
}

const partsOf = (bytes) => {
  const files = unzipSync(bytes);
  return Object.fromEntries(TEXT_PARTS.map((n) => [n, readParas(strFromU8(files[n]))]));
};
const rootTag = (xml) => xml.match(/<w:(document|hdr|ftr)\b[^>]*>/)[0];

describe('real Word file: kruti-test.docx (Kruti Dev -> Unicode)', async () => {
  const input = fixture('kruti-test.docx');
  const { bytes, stats } = await convertDocx(input, { direction: 'to-unicode' });
  const out = partsOf(bytes);
  const doc = out['word/document.xml'];
  const para = (text) => doc.find((x) => x.text === text);

  test('it converts without throwing', () => {
    assert.ok(stats.convertedChars > 0);
    assert.equal(stats.tables, 1);
  });

  test('header: भारत सरकार', () => {
    assert.deepEqual(out['word/header1.xml'].map((x) => x.text), ['भारत सरकार']);
  });

  test('footer: पृष्ठ', () => {
    assert.deepEqual(out['word/footer1.xml'].map((x) => x.text), ['पृष्ठ']);
  });

  test('title: आवेदन पत्र, bold', () => {
    const title = para('आवेदन पत्र');
    assert.ok(title, 'title converted');
    assert.ok(title.runs.every((x) => x.bold));
  });

  test('भारत सरकार के आदेश, with only सरकार bold', () => {
    const x = para('भारत सरकार के आदेश');
    assert.ok(x);
    assert.deepEqual(x.runs.filter((run) => run.bold).map((run) => run.t), ['सरकार']);
  });

  test('a word split across two runs -> हिन्दी', () => {
    assert.ok(para('हिन्दी'));
  });

  test('नाम Ramesh Kumar (ID: 45/2024): the English is unchanged, in Arial', () => {
    const x = para('नाम Ramesh Kumar (ID: 45/2024)');
    assert.ok(x);
    const english = x.runs.find((run) => run.t === 'Ramesh Kumar (ID: 45/2024)');
    assert.equal(english.font, 'Arial');
  });

  test('a paragraph whose Kruti font comes from its style -> मध्य प्रदेश', () => {
    assert.ok(para('मध्य प्रदेश'));
  });

  test('table: नाम | दिनांक | रमेश | 12/05/2024, the date unchanged', () => {
    const cells = doc.slice(-4);
    assert.deepEqual(cells.map((x) => x.text), ['नाम', 'दिनांक', 'रमेश', '12/05/2024']);
    assert.equal(cells[3].runs[0].font, 'Arial');
  });

  test('every other part is copied byte for byte', () => {
    const before = unzipSync(input);
    const after = unzipSync(bytes);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const name of Object.keys(before)) {
      if (TEXT_PARTS.includes(name)) continue;
      assert.deepEqual(after[name], before[name], name);
    }
    for (const name of ['docProps/thumbnail.jpeg', 'word/numbering.xml', 'customXml/item1.xml']) {
      assert.ok(after[name], `${name} kept`);
    }
  });

  test('converted parts keep their declaration and every namespace', () => {
    const before = unzipSync(input);
    const after = unzipSync(bytes);
    for (const name of TEXT_PARTS) {
      const a = strFromU8(before[name]);
      const b = strFromU8(after[name]);
      assert.ok(b.startsWith("<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"), name);
      assert.equal(rootTag(b), rootTag(a), name);
    }
  });
});

describe('real Word file: unicode-test.docx (Unicode -> Kruti Dev -> Unicode)', async () => {
  const input = fixture('unicode-test.docx');
  const kruti = await convertDocx(input, { direction: 'to-kruti' });
  const back = await convertDocx(kruti.bytes, { direction: 'to-unicode' });

  test('Unicode -> Kruti converts the Hindi into Kruti Dev 010', () => {
    assert.ok(kruti.stats.convertedChars > 0);
    const header = partsOf(kruti.bytes)['word/header1.xml'][0];
    assert.equal(header.text, 'Hkkjr ljdkj');
    assert.equal(header.runs[0].font, KRUTI_FONT);
  });

  test('English stays English, in its own font', () => {
    const doc = partsOf(kruti.bytes)['word/document.xml'];
    const english = doc.flatMap((x) => x.runs).find((run) => run.t.includes('Ramesh Kumar'));
    assert.equal(english.font, 'Arial');
  });

  test('converting back to Unicode gives the same Hindi text', () => {
    const original = partsOf(input);
    const roundTrip = partsOf(back.bytes);
    for (const name of TEXT_PARTS) {
      assert.deepEqual(
        roundTrip[name].map((x) => x.text),
        original[name].map((x) => x.text),
        name,
      );
    }
  });
});

test('single-quoted [Content_Types].xml still finds the header and footer', async () => {
  const files = unzipSync(fixture('kruti-test.docx'));
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace(/"/g, "'"));
  const { bytes } = await convertDocx(zipSync(files), { direction: 'to-unicode' });
  const out = partsOf(bytes);
  assert.equal(out['word/header1.xml'][0].text, 'भारत सरकार');
  assert.equal(out['word/footer1.xml'][0].text, 'पृष्ठ');
});

describe('dev server', () => {
  // docConvert.js is import()ed lazily; without this Vite discovers fflate
  // late and the upload failed with "504 Outdated Optimize Dep".
  test('fflate is pre-bundled so the lazy converter import cannot go stale', () => {
    const config = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
    assert.match(config, /optimizeDeps:\s*\{\s*include:\s*\[[^\]]*'fflate'/);
  });
});

// ---------------------------------------------------------------------------
// Every other font: the same engine for any { from, to } pair
// ---------------------------------------------------------------------------

describe('documents in every font', async () => {
  const { convert } = await import('./fontMaps.js');
  const font = (name) => `<w:rFonts w:ascii="${name}" w:hAnsi="${name}"/>`;

  test('Preeti -> Unicode: the Preeti runs convert, bold and italic carry over', async () => {
    const doc = makeDocx({
      document: body(p(r(font('Preeti'), 'g]kfn', '<w:b/><w:i/>'), r(ARIAL, ' Nepal'))),
    });
    const { text, stats } = await run(doc, { from: 'preeti', to: 'unicode' });
    const xml = text('word/document.xml');
    assert.deepEqual(runsOf(xml), [[['नेपाल', 'Mangal'], [' Nepal', 'Arial']]]);
    assert.match(xml, /<w:b\/><w:bCs\/><w:i\/><w:iCs\/>/);
    assert.ok(stats.convertedChars > 0);
  });

  test('Unicode -> DV-TT Surekh: Marathi becomes DV-TT code in DV-TTSurekh', async () => {
    const doc = makeDocx({ document: body(p(r(ARIAL, 'महाराष्ट्र शासन'))) });
    const { text } = await run(doc, { from: 'unicode', to: 'dvtt' });
    assert.deepEqual(runsOf(text('word/document.xml')), [[['¨É½É®É¹]Å ¶ÉÉºÉxÉ', 'DV-TTSurekh']]]);
  });

  test('DV-TT -> Unicode reads DV-TT Yogesh too, and the bar after a half letter stays with it', async () => {
    // `M` (ग्) and `É` in separate runs is still ग.
    const doc = makeDocx({ document: body(p(r(font('DV-TTYogesh'), 'M'), r(font('DV-TTYogesh'), 'É', '<w:b/>'))) });
    const { text } = await run(doc, { from: 'dvtt', to: 'unicode' });
    assert.deepEqual(textOf(text('word/document.xml')), ['ग']);
  });

  test('Kruti Dev -> DevLys: same keys, so the text is kept and only the font changes', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))) });
    const { text } = await run(doc, { from: 'kruti-dev', to: 'devlys' });
    assert.deepEqual(runsOf(text('word/document.xml')), [[['Hkkjr', 'DevLys 010']]]);
  });

  test('Kruti Dev -> Preeti goes through Unicode, as the text boxes do', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr'))) });
    const { text } = await run(doc, { from: 'kruti-dev', to: 'preeti' });
    assert.deepEqual(runsOf(text('word/document.xml')), [[[convert('भारत', 'unicode', 'preeti'), 'Preeti']]]);
  });

  test('a DevLys run converts on a Kruti Dev page: one keyboard layout', async () => {
    const doc = makeDocx({ document: body(p(r(font('DevLys 010'), 'Hkkjr'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['भारत']);
  });

  test('tables keep their structure, and only the cell text changes', async () => {
    const table =
      '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>' +
      `<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${p(r(font('Shivaji01'), 'marazI'))}</w:tc></w:tr></w:tbl>`;
    const doc = makeDocx({ document: body(table) });
    const { text, stats } = await run(doc, { from: 'shivaji', to: 'unicode' });
    const xml = text('word/document.xml');
    assert.equal(stats.tables, 1);
    assert.match(xml, /<w:tblPr><w:tblStyle w:val="TableGrid"\/><\/w:tblPr><w:tblGrid><w:gridCol w:w="4000"\/><\/w:tblGrid>/);
    assert.match(xml, /<w:tcPr><w:tcW w:w="4000" w:type="dxa"\/><\/w:tcPr>/);
    assert.deepEqual(textOf(xml), ['मराठी']);
  });

  test('a later cut whose keys differ is read with its own map, not the page\'s', async () => {
    // `pa~a` is पात्र in Shusha02 and पात्रा in Shusha.
    const doc = makeDocx({ document: body(p(r(font('Shusha02'), 'pa~a'))) });
    const { text } = await run(doc, { from: 'shusha', to: 'unicode' });
    assert.deepEqual(textOf(text('word/document.xml')), ['पात्र']);
  });

  test('each run converts from the font it is typed in, whatever the page', async () => {
    // A Kruti Dev letter with an Arjun paragraph and a Preeti line in it:
    // `=` is त्र in Kruti Dev and half त्र in Arjun.
    const doc = makeDocx({
      document: body(
        p(r(KRUTI, 'i=')) + p(r(font('Arjun'), 'i=k', '<w:b/>')) + p(r(font('Preeti'), 'g]kfn')),
      ),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['पत्र', 'पत्र', 'नेपाल']);
  });

  test('Word\'s curly quotes and dashes in a Kruti Dev run are read as that cut draws them', async () => {
    // ’ and ‘ are श् (the ' key) and “ ” are ष् (the " key) in Kruti Dev 011;
    // in 010 ’ is श् and “ is भ. – and — are दृ and कृ in every cut.
    const doc = makeDocx({
      document: body(
        p(r(font('Kruti Dev 011'), '‘kfDr Hkk“kk –f\"V —i;k')) +
          p(r(KRUTI, '’kfDr “kjr 2024')) +
          p(r(font('Kruti Dev 055'), 'lu~ 1947')),
      ),
    });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['शक्ति भाषा दृष्टि कृपया', 'शक्ति भारत 2024', 'सन् १९४७']);
  });

  test('Kruti Dev 055\'s own Alt codes are read as that cut draws them', async () => {
    // ƒ is घ in 055 (१ in 010), ‰ क्त, ‹ श्; † draws nothing.
    const doc = makeDocx({ document: body(p(r(font('Kruti Dev 055'), 'ƒj Hk‰ ‹kq†'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['घर भक्त शु']);
  });

  test('Kruti Dev 020 is read with DevLys 020\'s keys: ध on Ä, Hindi digits', async () => {
    const doc = makeDocx({ document: body(p(r(font('Kruti Dev 020'), 'Äku 2024'))) });
    const { text } = await run(doc, 'to-unicode');
    assert.deepEqual(textOf(text('word/document.xml')), ['धान २०२४']);
  });

  test('a style whose keys were not checked is left as it is', async () => {
    // Agra Wide types त्र on `=` as Kruti Dev does, unlike Agra.
    const doc = makeDocx({ document: body(p(r(font('Agra Wide'), 'i='))) });
    const { text, stats } = await run(doc, { from: 'agra', to: 'unicode' });
    assert.deepEqual(textOf(text('word/document.xml')), ['i=']);
    assert.equal(stats.convertedChars, 0);
  });

  test('a run already in the target font is left alone', async () => {
    const doc = makeDocx({ document: body(p(r(KRUTI, 'Hkkjr')) + p(r(font('Arjun'), 'i=k'))) });
    const { text } = await run(doc, { from: 'kruti-dev', to: 'arjun' });
    assert.deepEqual(runsOf(text('word/document.xml')), [[['Hkkjr', 'Arjun']], [['i=k', 'Arjun']]]);
  });

  test('a .txt converts between any two fonts', () => {
    assert.equal(convertTxt('g]kfn', { from: 'preeti', to: 'unicode' }).text, 'नेपाल');
    assert.equal(convertTxt('Hello महाराष्ट्र', { from: 'unicode', to: 'dvtt' }).text, 'Hello ¨É½É®É¹]Å');
  });

  test('file names and the summary name the fonts', () => {
    assert.equal(outputName('a.docx', { from: 'unicode', to: 'dvtt' }, 'docx'), 'a-dvtt.docx');
    assert.equal(outputName('a.docx', { from: 'preeti', to: 'unicode' }, 'docx'), 'a-unicode.docx');
    assert.equal(outputName('a.docx', { from: 'kruti-dev', to: 'abbasi-chanakya' }, 'docx'), 'a-abbasichanakya.docx');
    const none = { paragraphs: 1, tables: 0, convertedChars: 0, alreadyChars: 0 };
    assert.equal(summarize(none, { from: 'preeti', to: 'unicode' }).warning, 'No Preeti text found in this document. Is it already Unicode?');
    assert.equal(summarize(none, { from: 'unicode', to: 'dvtt' }).warning, 'No Unicode Hindi text found in this document. Is it already in DV-TT?');
  });

  test('syllables split across runs are kept together in any font', () => {
    assert.equal(splitsSyllable('M', 'É', 'dvtt'), true); // ग् + bar
    assert.equal(splitsSyllable('Ê', '´É', 'dvtt'), true); // ि before its letter
    assert.equal(splitsSyllable('´É ', '¨É', 'dvtt'), false);
  });
});
