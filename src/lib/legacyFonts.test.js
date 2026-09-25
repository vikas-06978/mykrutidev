import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FONTS } from './fontMaps.js';
import { PREVIEW_FONTS, previewFontFor } from './legacyFonts.js';

const root = new URL('../../', import.meta.url);
const srcDir = fileURLToPath(new URL('src/', root));
const fontsDir = new URL('public/fonts/', root);
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

// Font files as git tracks them, or null outside a git checkout (e.g. a
// tarball), in which case the disk check above still runs.
let tracked = null;
try {
  tracked = execFileSync('git', ['ls-files', 'public/fonts'], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .map((p) => p.slice('public/fonts/'.length));
} catch {
  tracked = null;
}

/** Every source file under dir that could name a font. */
function* sourceFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(p);
    else if (/\.(m?js|ts|astro|css|json)$/.test(e.name)) yield p;
  }
}

/** Drop block, HTML and line comments; `//` after a colon (a URL) is kept. */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');

/** A quoted font filename, bare or under /fonts/: 'KRDEV010.woff', "/fonts/x.ttf". */
const FONT_REF = /['"`](?:\/fonts\/)?([\w.-]+\.(?:woff2?|ttf|otf))['"`]/g;

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
      // Chanakya's pages are "coming soon" and deliberately load no font.
      if (key === 'shusha' || key === 'chanakya') continue;
      assert.ok(previewFontFor(key), `${key} has no preview font`);
    }
  });

  test('which pages load which preview font', () => {
    // Walkman-Chanakya: no font until the real 905 file is supplied and
    // verified (TODO in legacyFonts.js). A wrong face would draw wrong letters.
    assert.equal(previewFontFor('chanakya'), null);
    assert.ok(
      every.every((f) => !/chanakya/i.test(f.file) || f.file === 'abbasi-chanakya-new.woff'),
      'the only Chanakya-family file loaded is Abbasi Chanakya New',
    );
    // Abbasi Chanakya New is live and keeps its own font.
    assert.equal(previewFontFor('abbasi-chanakya').file, 'abbasi-chanakya-new.woff');
    // Kruti Dev and DevLys unchanged.
    assert.equal(previewFontFor('kruti-dev').file, 'KRDEV010.woff');
    assert.equal(previewFontFor('devlys').file, 'devlys-010.woff');
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

  test('every font file referenced in src/ exists in public/fonts with the exact same case', () => {
    // Scans every source file, not just the two registries, so a stray
    // url('/fonts/...') or a font name in a component is caught too. Comments
    // are stripped first: they may name files that are gone or not added yet.
    const refs = [];
    for (const file of sourceFiles(srcDir)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const m of code.matchAll(FONT_REF)) refs.push({ file, name: m[1] });
    }
    assert.ok(refs.length > 0, 'expected to find some font references');

    for (const { file, name } of refs) {
      const where = `${relative(fileURLToPath(root), file)} references "${name}"`;
      const loose = onDisk.find((f) => f.toLowerCase() === name.toLowerCase());
      assert.ok(
        onDisk.includes(name),
        loose
          ? `${where}, but public/fonts has "${loose}" - case differs, so it 404s on the host`
          : `${where}, which is not in public/fonts`,
      );
      // The host deploys what git has, not what Windows shows. Windows kept
      // "Chanakya.woff" on disk while git tracked "chanakya.woff", and the code
      // said a third name; only git's spelling reaches production.
      if (tracked) {
        const gitLoose = tracked.find((f) => f.toLowerCase() === name.toLowerCase());
        assert.ok(
          tracked.includes(name),
          gitLoose
            ? `${where}, but git tracks it as "${gitLoose}" - rename it with git mv`
            : `${where}, which git does not track, so it never deploys`,
        );
      }
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
