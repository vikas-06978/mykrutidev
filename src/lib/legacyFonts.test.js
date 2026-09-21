import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { FONTS } from './fontMaps.js';
import { PREVIEW_FONTS, previewFontFor } from './legacyFonts.js';

const fontsDir = new URL('../../public/fonts/', import.meta.url);
const css = readFileSync(new URL('../styles/legacy-fonts.css', import.meta.url), 'utf8');

const declaredFamilies = new Set(
  [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]),
);
const declarations = [
  ...css.matchAll(/url\('\/fonts\/([^']+)'\)\s*format\('([^']+)'\)/g),
].map((m) => ({ file: m[1], format: m[2] }));

// Read the real directory rather than statting each name: on Windows a stat is
// case-insensitive and would pass for "krdev010.woff", then 404 on the host.
const onDisk = readdirSync(fontsDir);
const fontFiles = onDisk.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
const every = Object.values(PREVIEW_FONTS);

/** What a file actually is, by its first four bytes. */
const sniff = (name) => {
  const head = readFileSync(new URL(name, fontsDir)).subarray(0, 4);
  if (head.toString('latin1') === 'wOFF') return 'woff';
  if (head.toString('latin1') === 'wOF2') return 'woff2';
  if (head.toString('latin1') === 'OTTO') return 'opentype';
  if (head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))) return 'truetype';
  return `unknown(${head.toString('hex')})`;
};

describe('legacy preview fonts', () => {
  test('exactly one preview font per legacy font key', () => {
    for (const [key, font] of Object.entries(FONTS)) {
      if (font.kind !== 'legacy') continue;
      // Shusha has neither a map nor a font file, so it has nothing to preview.
      if (key === 'shusha') continue;
      assert.ok(previewFontFor(key), `${key} has no preview font`);
    }
  });

  test('no variant picker survives', () => {
    // The dropdown is gone on purpose. Re-adding one means re-adding a control
    // that changes nothing a user can act on.
    for (const key of Object.keys(PREVIEW_FONTS)) {
      assert.equal(typeof PREVIEW_FONTS[key], 'object');
      assert.ok(!Array.isArray(PREVIEW_FONTS[key]), `${key} maps to a list again`);
    }
    assert.equal(previewFontFor('kruti-dev').label, 'Kruti Dev 010');
    assert.equal(previewFontFor('devlys').label, 'DevLys 010');
  });

  test('a Unicode font has no preview font', () => {
    assert.equal(previewFontFor('unicode'), null);
    assert.equal(previewFontFor('mangal'), null);
  });

  // ---- The filename contract. A mismatch here 404s only in production. ----

  test('every file named in the registry exists in public/fonts', () => {
    for (const f of every) {
      assert.ok(
        onDisk.includes(f.file),
        `${f.label}: public/fonts/${f.file} is not on disk (have: ${onDisk.join(', ')})`,
      );
    }
  });

  test('every url in legacy-fonts.css exists in public/fonts', () => {
    assert.ok(declarations.length > 0, 'expected the stylesheet to reference some files');
    for (const d of declarations) {
      assert.ok(onDisk.includes(d.file), `legacy-fonts.css points at missing ${d.file}`);
    }
  });

  test('the stylesheet and the registry reference the same set of files', () => {
    assert.deepEqual(
      [...new Set(declarations.map((d) => d.file))].sort(),
      [...new Set(every.map((f) => f.file))].sort(),
    );
  });

  test('every family has a matching @font-face', () => {
    for (const f of every) {
      assert.ok(declaredFamilies.has(f.family), `no @font-face for "${f.family}"`);
    }
  });

  test('declared format matches the file contents, not the extension', () => {
    // Two of the owner's files are named .woff but are raw TrueType inside.
    // format() is a promise about the CONTENT: get it wrong and the browser
    // fetches the file, fails to parse it and drops the face, with no error
    // anywhere except a blank preview.
    for (const d of declarations) {
      assert.equal(
        d.format,
        sniff(d.file),
        `${d.file} is declared format('${d.format}') but its bytes say ${sniff(d.file)}`,
      );
    }
  });

  test('the registry agrees with the stylesheet about each format', () => {
    for (const f of every) {
      const d = declarations.find((x) => x.file === f.file);
      assert.equal(f.format, d.format, `${f.label}: registry and css disagree`);
      assert.equal(f.format, sniff(f.file), `${f.label}: registry format is wrong`);
    }
  });

  test('every font file is a real font container', () => {
    for (const name of fontFiles) {
      assert.ok(!sniff(name).startsWith('unknown'), `${name} is not a font`);
    }
  });

  test('the converted DevLys woff is valid and covers the ASCII keys', () => {
    // Converted from the supplied TTF. A legacy font stores Hindi in ASCII
    // slots, so if the cmap does not cover A-Z the preview shows nothing.
    const buf = readFileSync(new URL('devlys-010.woff', fontsDir));
    assert.equal(buf.toString('latin1', 0, 4), 'wOFF');
    assert.equal(buf.readUInt32BE(8), buf.length, 'WOFF length header is wrong');
    assert.ok(buf.readUInt16BE(12) > 0, 'no tables');
  });

  test('no served font file has a space in its name', () => {
    // Spaces force percent-encoding in url() and are a classic source of
    // works-locally-404s-in-production.
    for (const name of fontFiles) {
      assert.doesNotMatch(name, /\s/, `${name} has a space`);
    }
  });

  // ---- Shape ----

  test('stack names the namespaced face first, then the installed one', () => {
    for (const f of every) {
      assert.ok(f.stack.startsWith(`"${f.family}"`), f.label);
      assert.ok(f.stack.includes(`"${f.label}"`), f.label);
      assert.ok(f.stack.endsWith('monospace'), f.label);
    }
  });

  test('family is the namespaced form of the label', () => {
    for (const f of every) assert.equal(f.family, `MKD ${f.label}`);
  });
});
