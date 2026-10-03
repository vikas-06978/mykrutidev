# Legacy font files (`public/fonts/`)

The files in `public/fonts/` power the **output preview** on the legacy-font converter pages. They are
presentation only: the character maps in `src/lib/fontMaps.js` decide what the
converter produces, and neither copy button nor either `.docx` download is
affected by which preview font is selected or whether a file there exists.

Kruti Dev, Chanakya and Preeti are commercial fonts. Keep them in `public/fonts/` only under
a licence that permits web embedding. Nothing is hotlinked from a CDN, per
[DESIGN.md](DESIGN.md).

This note used to sit next to the fonts, but everything in `public/` is
published with the site, so it lives here instead.

## What is in `public/fonts/` now

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
| `preeti.woff`        | Preeti          | **TrueType**      | **preview on the Preeti pages** (the map was read off this file) |
| `shusha.woff`        | Shusha          | WOFF              | **preview on the Shusha pages** (the map was read off this file) |
| `shivaji01.woff`     | Shivaji01       | WOFF              | **preview on the Shivaji pages** (the map was read off this file) |
| `dvtt-surekh.woff`   | DV-TTSurekh     | WOFF              | **preview on the Marathi (DV-TT) pages** (the map was read off this file) |
| `arjun.woff` | Arjun | WOFF | **preview on its own two pages** (the map was read off this file) |
| `kundli.woff` | Kundli | WOFF | **preview on its own two pages** (the map was read off this file) |
| `krishna.woff` | Krishna | WOFF | **preview on its own two pages** (the map was read off this file) |
| `new-delhi.woff` | NewDelhi | WOFF | **preview on its own two pages** (the map was read off this file) |
| `ruchi.woff` | Ruchi-Normal | WOFF | **preview on its own two pages** (the map was read off this file) |
| `devlys-020.woff` | DevLys 020 | WOFF | **preview on its own two pages** (the map was read off this file) |
| `ajay.woff` | Ajay Normal | WOFF | **preview on its own two pages** (the map was read off this file) |
| `aman.woff` | Aman Condensed | WOFF | **preview on its own two pages** (the map was read off this file) |
| `agra.woff` | Agra | WOFF | **preview on its own two pages** (the map was read off this file) |
| `himalaya.woff` | HIMALAYA TT FONT | WOFF | **preview on its own two pages** (the map was read off this file) |
| `akshar.woff` | Akshar | WOFF | **preview on its own two pages** (the map was read off this file) |
| `dina.woff` | DINA-A | WOFF | **preview on its own two pages** (the map was read off this file) |
| `devanagari-bold.woff` | DevanagariBold | WOFF | **preview on its own two pages** (the map was read off this file) |
| `narad.woff` | Narad | WOFF | **preview on its own two pages** (the map was read off this file) |
| `aakriti.woff` | Aakriti | WOFF | **preview on its own two pages** (the map was read off this file) |
| `anjali.woff` | Anjali | WOFF | **preview on its own two pages** (the map was read off this file) |
| `shusha02.woff` | Shusha02 | WOFF | **preview on its own two pages** (the map was read off this file) |
| `shivaji02.woff` | Shivaji02 | WOFF | **preview on its own two pages** (the map was read off this file) |
| `lmg-arun.woff` | LMG-Arun | WOFF | **preview on the LMG Arun pages** (the map was read off this file) |
| `terafont-varun.woff` | TERAFONT-VARUN | WOFF | **preview on the Gujarati / Terafont pages** |
| `bamini.woff` | Bamini PB | WOFF | **preview on the Tamil (Bamini) pages** (the map was read off this file) |
| `sutonnymj.woff` | SutonnyMJ | WOFF | **preview on the Bengali (SutonnyMJ) pages** (the map was read off this file) |

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

## Fonts on another font's keyboard

Arjun, Kundli, Krishna, New Delhi, Ruchi, DevLys 020, Ajay, Aman and Agra type
on the Kruti Dev keyboard, the Nepali fonts (Himalaya, Akshar, DINA, Devanagari
Bold, Narad, Aakriti, Anjali) on Preeti's, Shusha02 and Shivaji02 on Shusha's.
Each map in `src/lib/fontMaps.js` is the base map with the keys that differ
dropped and the font's own keys added. Each was checked the same way:

1. Every key of the base map drawn in both fonts side by side, and the keys
   that differ read by eye. Every glyph the font has on a key the base does not
   use was read too. Anything not read with certainty is left out (each map's
   comment lists what).
2. A sentence converted from Unicode into the font, drawn in the font file
   itself and read back (`src/lib/fontVariants.test.js` keeps those sentences).
3. The same sentence drawn in **every style file** of the family, because a
   Bold or Wide cut is sometimes another layout. The Word upload
   (`src/lib/wordFonts.js`) only recognises the styles that passed:

| Family | Styles read with the map | Left out (other keys) |
| ------ | ------------------------ | --------------------- |
| Krishna | Krishna, Condensed, Wide, Bold Italic | Krishna Italic (another layout) |
| NewDelhi | Normal, Bold, Italic, Bold Italic (Bold draws श on `'`, which is read too) | |
| Agra | Agra | Agra Bold, Wide, Thin (त्र on `=`, as in Kruti Dev) |
| DINA | DINA-A, Dina Outline, DINA27 | DINA30 Outline (not read) |
| DevLys 020, Aman, Ajay, Ruchi, Akshar, Narad, Aakriti | every style supplied | |

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
