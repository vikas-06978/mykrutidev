import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

import { buildDocx } from './docx.js';

const open = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, files: unzipSync(bytes) };
};

describe('buildDocx', () => {
  test('produces a zip with the three parts Word requires', async () => {
    const { bytes, files } = await open(buildDocx('भारत'));
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK', 'zip magic');
    assert.deepEqual(Object.keys(files).sort(), [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
  });

  test('carries the wordprocessingml media type', () => {
    assert.equal(
      buildDocx('भारत').type,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  test('binds the requested font to the complex-script slot', async () => {
    const { files } = await open(buildDocx('भारत', { fontName: 'Mangal' }));
    const doc = strFromU8(files['word/document.xml']);
    // w:cs is the slot Word consults for Devanagari. Without it the text
    // renders in the document default and Kruti Dev output is unreadable.
    assert.match(doc, /w:cs="Mangal"/);
    assert.match(doc, /w:ascii="Mangal"/);
    assert.ok(doc.includes('भारत'));
    assert.ok(doc.startsWith('<?xml'));
  });

  test('one paragraph per line, blank lines preserved', async () => {
    const { files } = await open(buildDocx('one\n\ntwo\nthree'));
    const doc = strFromU8(files['word/document.xml']);
    assert.equal((doc.match(/<w:p[ />]/g) || []).length, 4);
    assert.match(doc, /<w:p\/>/); // the blank line
  });

  test('escapes XML so hostile text cannot corrupt the part', async () => {
    const { files } = await open(buildDocx('a & b < c > "d" <w:p/>'));
    const body = strFromU8(files['word/document.xml']).split('<w:body>')[1];
    assert.ok(body.includes('&amp;'));
    assert.ok(body.includes('&lt;w:p/&gt;'));
  });

  test('strips control characters that would make the file unopenable', async () => {
    const { files } = await open(buildDocx('a\u0000b\u0007c'));
    const doc = strFromU8(files['word/document.xml']);
    assert.doesNotMatch(doc, /[\u0000\u0007]/);
    assert.ok(doc.includes('abc'));
  });

  test('handles CRLF input', async () => {
    const { files } = await open(buildDocx('one\r\ntwo'));
    const doc = strFromU8(files['word/document.xml']);
    assert.equal((doc.match(/<w:p[ />]/g) || []).length, 2);
    assert.doesNotMatch(doc, /\r/);
  });
});
