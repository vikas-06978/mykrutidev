/**
 * Minimal, real .docx writer.
 *
 * The competitor ships an HTML file renamed to .doc, which Word opens with a
 * warning and which loses the font binding. This builds actual Office Open XML
 * so the paragraphs carry the right typeface — for a legacy font that matters,
 * because Kruti Dev text rendered in Calibri is unreadable mojibake.
 *
 * Loaded on demand (dynamic import from the Converter), so fflate stays out of
 * the initial page bundle.
 */
import { zipSync, strToU8 } from 'fflate';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const escapeXml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control characters XML 1.0 forbids; they would make the file
    // unopenable rather than merely ugly.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/**
 * `w:rFonts` needs the face named on all four script slots. `cs` (complex
 * script) is the one Word actually consults for Devanagari; `ascii`/`hAnsi`
 * cover legacy fonts, whose text *is* ASCII as far as Word is concerned.
 */
function paragraph(line, fontName, sizeHalfPoints) {
  const font = escapeXml(fontName);
  const rPr =
    `<w:rPr>` +
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` +
    `<w:sz w:val="${sizeHalfPoints}"/><w:szCs w:val="${sizeHalfPoints}"/>` +
    `</w:rPr>`;
  if (!line) return '<w:p/>'; // blank line
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
}

export function buildDocx(text, { fontName = 'Mangal', fontSize = 12 } = {}) {
  const halfPoints = Math.round(fontSize * 2);
  const body = String(text)
    .split(/\r\n|\r|\n/)
    .map((line) => paragraph(line, fontName, halfPoints))
    .join('');

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;

  const zipped = zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      'word/document.xml': strToU8(document),
    },
    // Word rejects some aggressive settings; level 6 is the safe default.
    { level: 6 },
  );

  return new Blob([zipped], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function downloadDocx(text, { fontName, fileName = 'mykrutidev.docx', fontSize } = {}) {
  const blob = buildDocx(text, { fontName, fontSize });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
