# Legacy font files (reference only, never published)

The font files the site's character maps are built from. One folder per font
family, named after the family name stored inside the file, with every style
(Bold, Italic, Condensed, Thin, Wide, EN) of that family together. Exact
duplicates were removed.

Nothing in `vendor/` is served by the website. Most of these fonts are
commercial, so they stay here, in the private repository, and only the
character map built from a file goes into `src/lib/fontMaps.js`. The few
fonts the site does show (for the output preview) are copied to
`public/fonts/` one by one, see `docs/FONTS.md`.

## A font file is not a mapping

A converter goes live for a font only after its map has been read off the
font file glyph by glyph (or the font has been shown, key by key, to draw the
same letters as a font that already has a verified map). Many legacy fonts
LOOK alike and differ on a handful of keys, which is exactly the error that
produces believable but wrong Hindi.

## Status

| Folder | Layout | Status |
| :-- | :-- | :-- |
| DevLys 010 | Kruti Dev 010 | **Live**. All styles draw the same letter on every key Kruti Dev uses. |
| Abbasi Chanakya New | its own | **Live (Beta)** |
| DevLys 020 | Kruti Dev 010, except `Û`, and Hindi digits on the number keys | Being checked |
| Arjun | Kruti Dev 010, except `=` (half त्र, full त्र is `=k`) | Being checked |
| Kundli | close to Kruti Dev 010, `Ñ` draws औ | Being checked |
| Akshar, Aakriti, DINA, Himalaya, Narad, Devanagari Bold, Anjali | close to Preeti (Nepali) | Being checked |
| Shusha, Shivaji | one layout (Shivaji01 and Shusha are the same font) | Map to be built |
| Vakil | close to Shusha | Map to be built |
| Krishna, New Delhi, Ruchi | close to each other | Map to be built |
| Agra, Aman, Maya, Ajay | their own layouts | Map to be built |
| DV-TTSurekh, DV-TTYogesh, DV-TTGanesh, DV-Divyae | DV-TT (Marathi) | Map to be built |
| Millennium (Varun, Shailesh, Mogara, Priya, Gauri, Shridhar, Deepak) | Millennium | Map to be built |
| Chanakya, Patrika | newspaper Chanakya: conjuncts on the lowercase keys, letters in the upper range | Needs real documents typed in it |
| BharatVani, Shree-Dev-0708EW, Devanagari New, Fontasy Himali | unknown yet | To be examined |
| Akshar Unicode | already Unicode, needs no converter | - |
