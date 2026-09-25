# Legacy font files

These power the **output preview** on the legacy-font converter pages. They are
presentation only: the character maps in `src/lib/fontMaps.js` decide what the
converter produces, and neither copy button nor either `.docx` download is
affected by which preview font is selected or whether a file here exists.

Kruti Dev, Chanakya and Preeti are commercial fonts. Keep them here only under a
licence that permits web embedding. Nothing is hotlinked from a CDN, per
DESIGN.md.

## What is here now

| File                 | Font family     | Container         | Used by |
| -------------------- | --------------- | ----------------- | ------- |
| `KRDEV010.woff`      | Kruti Dev 010   | WOFF              | **preview on Kruti Dev output pages** |
| `devlys-010.woff`    | DevLys 010      | WOFF              | registered for preview; no live page yet |
| `KRDEV011.woff`      | Kruti Dev 011   | WOFF              | nothing, kept for later |
| `Kruti-Dev-012.woff` | Kruti Dev 012   | WOFF              | nothing, kept for later |
| `Kruti-Dev-014.woff` | Kruti Dev 014   | WOFF              | nothing, kept for later |
| `KRDEV016.woff`      | Kruti Dev 016   | WOFF              | nothing, kept for later |
| `KRDEV020.woff`      | Kruti Dev 020   | WOFF              | nothing, kept for later |
| `KRDEV055.woff`      | Kruti Dev 055   | WOFF              | nothing, kept for later |
| `abbasi-chanakya-new.woff` | Abbasi Chanakya New | WOFF    | **preview on the Abbasi Chanakya pages** |
| `preeti.woff`        | Preeti          | **TrueType**      | nothing yet, no verified map |

The numbered Kruti Dev variants used to fill a dropdown in the output box. That
picker is gone: the variants share one keyboard layout and differ only in
letterforms, so choosing one changed nothing a user could act on. The files stay
here in case a reason to surface them appears, but nothing references them and
they are never downloaded by a visitor.

**There is no Walkman-Chanakya font here, on purpose.** The old `chanakya.woff`
did not match the Chanakya character map and was removed. The Chanakya pages are
"coming soon" and load no preview font. When the real Walkman-Chanakya 905 font
arrives, follow "Adding or replacing a font" below (see the TODO above CHANAKYA
in `src/lib/fontMaps.js`).

`devlys-010.woff` was converted from the supplied `DevLys 010 Normal.ttf`, which
is kept out of the served tree in `vendor/fonts/` (the original download folder
also contained a `readme.html` that would otherwise have been published, and a
filename with spaces). **A font file is not a mapping**: the DevLys converter
pages stay "coming soon" until the DevLys character map is diffed against real
DevLys documents.

Two things to know about that table:

1. **The filenames are inconsistent and that is fine.** `KRDEV010.woff` and
   `Kruti-Dev-012.woff` are both referenced exactly as spelled. Do not rename a
   file without updating `src/styles/legacy-fonts.css` and `src/lib/legacyFonts.js`
   together. Static hosts are case-sensitive even though Windows is not, so
   `krdev010.woff` would 404 in production while working locally.

2. **`preeti.woff` is not WOFF.** Its first four bytes are
   `00 01 00 00`, which is raw TrueType. It is declared
   `format('truetype')` for that reason. A `format()` hint that disagrees with
   the file's actual contents makes the browser download it and then silently
   discard the face.

`npm test` enforces both points: it reads this directory, checks every
`/fonts/...` filename referenced anywhere in `src/` matches byte for byte
(including case), and sniffs each file's magic bytes
against its declared format.

## Adding or replacing a font

1. Drop the file in this directory.
2. Add a `@font-face` block in `src/styles/legacy-fonts.css`, with a `format()`
   that matches the file's real container, not its extension.
3. Add or update the matching entry in `src/lib/legacyFonts.js`, setting `file`
   to the exact filename.
4. Run `npm test`.

### Converting a TTF

`npx ttf2woff2 < input.ttf > output.woff2` if you have network access. WOFF is
just the sfnt tables zlib-deflated behind a new header, so it can also be done
offline with Node's `zlib` alone; that is how `devlys-010.woff` was produced
(47% smaller than the TTF, all 14 tables verified byte for byte against the
original).

### Adding woff2

Optional, and worth it: woff2 is roughly 30% smaller. Convert with
`npx ttf2woff2 < input.ttf > output.woff2`, then put the woff2 `url()` **above**
the existing woff line in the same `src` list. Browsers take the first format
they understand. Do not add a woff2 url before the file exists, or every visitor
pays a 404 before falling back.
