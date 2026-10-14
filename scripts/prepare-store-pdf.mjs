// Prepare a PDF for the store so every download can carry its buyer's stamp.
//
//   node scripts/prepare-store-pdf.mjs <in.pdf> <out.pdf>
//
// Adds one line of small grey type at the foot of every page: a fixed-length
// placeholder that server/storeStamp.js overwrites, at download time, with
// "Licensed to ab***@gmail.com - Order ...". Upload <out.pdf> to the R2 bucket.
// See docs/STORE.md ("Stamping").
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

import { STAMP_SLOT } from '../server/storeStamp.js';

/** @param {Uint8Array} bytes the finished PDF @returns {Promise<Uint8Array>} the same PDF with a stamp slot on every page */
export async function prepare(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 6.5;
  const width = font.widthOfTextAtSize(STAMP_SLOT, size);
  for (const page of doc.getPages()) {
    // Centred for a typical buyer line (the slot is as wide as the longest one); the page is not touched otherwise.
    const x = Math.max(20, (page.getWidth() - width) / 2).toFixed(2);
    // The line is written as a raw, UNCOMPRESSED content stream, so the placeholder can be found in the file's bytes.
    // (page.drawText would deflate it.)
    const stream = doc.context.stream(`q BT /MkdStamp ${size} Tf 0.45 0.45 0.5 rg ${x} 7 Td (${STAMP_SLOT}) Tj ET Q`);
    page.node.setFontDictionary(PDFName.of('MkdStamp'), font.ref);
    page.node.addContentStream(doc.context.register(stream));
  }
  // useObjectStreams: false keeps the page content in plain streams, where the slot stays findable.
  return doc.save({ useObjectStreams: false });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node scripts/prepare-store-pdf.mjs <in.pdf> <out.pdf>');
    process.exit(2);
  }
  const out = await prepare(readFileSync(input));
  writeFileSync(output, out);
  console.log(`wrote ${output} (${out.length} bytes)`);
}
