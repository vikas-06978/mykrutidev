import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

import { buildDocx, downloadDocx } from './docx.js';

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

  test('defaults to Mangal, which is the Unicode side of the converter', async () => {
    const { files } = await open(buildDocx('भारत'));
    assert.match(strFromU8(files['word/document.xml']), /w:cs="Mangal"/);
  });

  /**
   * OOXML measures type in half-points, so every size has to be doubled on the
   * way in. Getting this wrong is not a crash - it silently produces a document
   * at half or double the size the user asked for.
   */
  test('font size is written in half-points', async () => {
    const { files } = await open(buildDocx('भारत', { fontSize: 14 }));
    const doc = strFromU8(files['word/document.xml']);
    assert.match(doc, /<w:sz w:val="28"\/>/);
    assert.match(doc, /<w:szCs w:val="28"\/>/);
  });

  test('the default size is 12pt', async () => {
    assert.match(strFromU8((await open(buildDocx('x'))).files['word/document.xml']),
      /<w:sz w:val="24"\/>/);
  });

  test('a half-point size stays an integer', async () => {
    // w:val must be a whole number; 10.5pt is 21 half-points exactly.
    const { files } = await open(buildDocx('x', { fontSize: 10.5 }));
    assert.match(strFromU8(files['word/document.xml']), /<w:sz w:val="21"\/>/);
  });

  test('szCs matches sz, so Devanagari is not sized separately', async () => {
    const { files } = await open(buildDocx('भारत', { fontSize: 18 }));
    const doc = strFromU8(files['word/document.xml']);
    const sz = doc.match(/<w:sz w:val="(\d+)"\/>/)[1];
    const szCs = doc.match(/<w:szCs w:val="(\d+)"\/>/)[1];
    assert.equal(sz, '36');
    assert.equal(szCs, sz);
  });

  /**
   * The font name goes into an XML attribute. A quote in it would close the
   * attribute early and produce a file Word refuses to open - and font names
   * with quotes and ampersands do exist.
   */
  test('the font name is escaped, not interpolated raw', async () => {
    const { files } = await open(buildDocx('x', { fontName: 'A"B&C' }));
    const doc = strFromU8(files['word/document.xml']);
    assert.match(doc, /w:ascii="A&quot;B&amp;C"/);
    assert.doesNotMatch(doc, /w:ascii="A"B/);
  });

  test('leading and trailing spaces survive', async () => {
    // Without xml:space="preserve" Word collapses them and the converted text
    // comes back subtly different from what was on screen.
    const { files } = await open(buildDocx('  padded  '));
    const doc = strFromU8(files['word/document.xml']);
    assert.match(doc, /xml:space="preserve"/);
    assert.ok(doc.includes('>  padded  <'));
  });

  test('empty text is still a valid document', async () => {
    const { files } = await open(buildDocx(''));
    const doc = strFromU8(files['word/document.xml']);
    assert.match(doc, /<w:body><w:p\/><w:sectPr/);
  });

  test('non-string input is coerced rather than throwing', async () => {
    const { files } = await open(buildDocx(12345));
    assert.ok(strFromU8(files['word/document.xml']).includes('12345'));
  });

  test('every document carries a section with page size and margins', async () => {
    const { files } = await open(buildDocx('x'));
    const doc = strFromU8(files['word/document.xml']);
    // A4. Word will open a document without sectPr, but it guesses Letter.
    assert.match(doc, /<w:pgSz w:w="11906" w:h="16838"\/>/);
    assert.match(doc, /<w:pgMar /);
  });

  test('the relationship part points at the document part', async () => {
    const { files } = await open(buildDocx('x'));
    const rels = strFromU8(files['_rels/.rels']);
    assert.match(rels, /Target="word\/document\.xml"/);
    assert.match(strFromU8(files['[Content_Types].xml']), /PartName="\/word\/document\.xml"/);
  });
});

/**
 * downloadDocx is the browser half: it never runs under Node in production, but
 * it is the part that actually hands the user their file, and the order of the
 * anchor dance matters. Firefox ignores a click on an anchor that is not in the
 * document, and revoking the object URL too early cancels the download - so the
 * sequence is asserted, not just the outcome.
 */
describe('downloadDocx', () => {
  const withFakeDom = (fn) => {
    const saved = {
      document: globalThis.document,
      URL: Object.getOwnPropertyDescriptor(globalThis, 'URL'),
      setTimeout: globalThis.setTimeout,
    };
    const log = [];
    const anchor = {
      set href(v) { log.push(['href', v]); this._href = v; },
      get href() { return this._href; },
      set download(v) { log.push(['download', v]); this._download = v; },
      get download() { return this._download; },
      click: () => log.push(['click']),
      remove: () => log.push(['remove']),
    };

    globalThis.document = {
      createElement: (tag) => { log.push(['createElement', tag]); return anchor; },
      body: { appendChild: (el) => log.push(['appendChild', el === anchor]) },
    };
    globalThis.URL = {
      createObjectURL: (blob) => { log.push(['createObjectURL', blob]); return 'blob:fake'; },
      revokeObjectURL: (url) => log.push(['revokeObjectURL', url]),
    };
    const timers = [];
    globalThis.setTimeout = (cb, ms) => { timers.push([cb, ms]); return 0; };

    try {
      return fn({ log, anchor, flush: () => timers.forEach(([cb]) => cb()), timers });
    } finally {
      globalThis.document = saved.document;
      if (saved.URL) Object.defineProperty(globalThis, 'URL', saved.URL);
      globalThis.setTimeout = saved.setTimeout;
    }
  };

  const names = (log) => log.map(([k]) => k);

  test('it builds, links and clicks, in that order', () => {
    withFakeDom(({ log }) => {
      downloadDocx('भारत');
      assert.deepEqual(names(log), [
        'createObjectURL', 'createElement', 'href', 'download',
        'appendChild', 'click', 'remove',
      ]);
    });
  });

  test('the anchor is in the document before it is clicked', () => {
    // Firefox drops a click on a detached anchor and the download never starts.
    withFakeDom(({ log }) => {
      downloadDocx('x');
      const n = names(log);
      assert.ok(n.indexOf('appendChild') < n.indexOf('click'));
      assert.ok(n.indexOf('click') < n.indexOf('remove'));
    });
  });

  test('it downloads a real docx blob', () => {
    withFakeDom(({ log }) => {
      downloadDocx('भारत', { fontName: 'Mangal' });
      const [, blob] = log.find(([k]) => k === 'createObjectURL');
      assert.equal(
        blob.type,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      assert.ok(blob.size > 0);
    });
  });

  test('it creates an anchor, not some other element', () => {
    withFakeDom(({ log }) => {
      downloadDocx('x');
      assert.deepEqual(log.find(([k]) => k === 'createElement'), ['createElement', 'a']);
    });
  });

  test('the default file name is the site name', () => {
    withFakeDom(({ anchor }) => {
      downloadDocx('x');
      assert.equal(anchor.download, 'mykrutidev.docx');
      assert.equal(anchor.href, 'blob:fake');
    });
  });

  test('a caller can name the file', () => {
    withFakeDom(({ anchor }) => {
      downloadDocx('x', { fileName: 'kruti-dev-to-unicode.docx' });
      assert.equal(anchor.download, 'kruti-dev-to-unicode.docx');
    });
  });

  test('the object URL is revoked, but only after a delay', () => {
    // Revoking synchronously cancels the download in Chrome.
    withFakeDom(({ log, timers, flush }) => {
      downloadDocx('x');
      assert.ok(!names(log).includes('revokeObjectURL'), 'revoked too early');
      assert.equal(timers.length, 1);
      assert.ok(timers[0][1] >= 1000, 'the delay is too short to be safe');
      flush();
      assert.deepEqual(log.at(-1), ['revokeObjectURL', 'blob:fake']);
    });
  });

  test('the font and size reach the file it hands over', async () => {
    // The blob is captured inside the fake DOM and opened outside it: awaiting
    // inside withFakeDom would restore the globals before the assertions ran,
    // and the test would pass without checking anything.
    const blob = withFakeDom(({ log }) => {
      downloadDocx('भारत', { fontName: 'Kruti Dev 010', fontSize: 16 });
      return log.find(([k]) => k === 'createObjectURL')[1];
    });
    const { files } = await open(blob);
    const doc = strFromU8(files['word/document.xml']);
    assert.match(doc, /w:cs="Kruti Dev 010"/);
    assert.match(doc, /<w:sz w:val="32"\/>/);
  });
});
