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

## Other languages

Hindi, Marathi and Nepali fonts sit directly in this folder, one folder per
family. Fonts for other scripts go in their language's folder, each with a
README on how to upload:

| Folder | For | Site page |
| :-- | :-- | :-- |
| `Gujarati/` | Gujarati (LMG Arun, Saumil, Gopika, Vakil...) | /gujarati-font-converter |
| `Punjabi/` | Punjabi in Gurmukhi (AnmolLipi, Asees, Joy...) | /punjabi-font-converter |
| `Bengali/` | Bengali (SutonnyMJ and the Bijoy fonts) | /bengali-font-converter |
| `Tamil/` | Tamil (Bamini, TSCII, TAB...) | /tamil-font-converter |
| `Other/` | any other language | - |

## Status

| Folder | Layout | Status |
| :-- | :-- | :-- |
| DevLys 010 | Kruti Dev 010 | **Live**. All styles draw the same letter on every key Kruti Dev uses. |
| Abbasi Chanakya New | its own | **Live (Beta)** |
| Arjun, Kundli, Krishna, New Delhi, Ruchi, DevLys 020, Ajay, Aman, Agra | Kruti Dev 010 with keys of their own (see `src/lib/fontMaps.js`) | **Live (Beta)**. Styles covered are listed in `docs/FONTS.md`: not Krishna Italic, Agra Bold/Wide/Thin |
| Himalaya, Akshar, DINA, Devanagari Bold, Narad, Aakriti, Anjali | Preeti (Nepali) with keys of their own | **Live (Beta)**. Not DINA30 |
| Shusha, Shivaji | one layout. Shivaji01 is Shusha with a full stop for the danda | **Live (Beta)**, Shusha05 and Shivaji05 included |
| Shusha02, Shivaji02 | Shusha with four keys changed | **Live (Beta)** |
| DV-TTSurekh, DV-TTYogesh | DV-TT (Marathi). Yogesh draws the same letter as Surekh on every key, the EN styles differ only in drawing English digits | **Live (Beta)** on /marathi-font-converter |
| Gujarati/LMG Arun, LMG Laxmi, LMG Rupen | the Gujarati typewriter keyboard | **Live (Beta)** on /lmg-arun-to-unicode, every style |
| Gujarati/Terafont-Varun (Varun, Ganesh, Indra, Kinnari, Parth, Suraj, Trilo) | LMG Arun's keys but À É Ö | **Live (Beta)** on /gujarati-font-converter. Not TERAVRUN (Varuna "Fat and Thin") or -IND1: symbol fonts |
| Gujarati/Vakil | Gujarati letters on a Shusha-like keyboard | Map to be built (Gujarati) |
| Tamil/Bamini | the Tamil typewriter keyboard | **Live (Beta)** on /tamil-font-converter |
| Bengali/SutonnyMJ | Bijoy | Map to be built |
| Bengali/Kalpurush, SolaimanLipi | already Unicode (the uploaded files hold the Unicode Bengali block), need no converter | - |
| Chanakya/Chanakya Regular.ttf | the same file as Chanakya.ttf (newspaper Chanakya), not Walkman-Chanakya 905 | Needs real documents, or the Walkman-Chanakya 905 font |
| Gujarati/Saumil, Gopika, Avantika, Shree768, Gujrati Saral 1, Krishna | each its own keyboard | Map to be built (Gujarati) |
| Maya | its own layout | Map to be built |
| DV-TTGanesh, DV-Divyae | their own layouts, not DV-TT Surekh's | Map to be built |
| Millennium (Varun, Shailesh, Mogara, Priya, Gauri, Shridhar, Deepak) | Millennium | Map to be built |
| Chanakya, Patrika | newspaper Chanakya: conjuncts on the lowercase keys, letters in the upper range | Needs real documents typed in it |
| BharatVani, Shree-Dev-0708EW, Devanagari New, Fontasy Himali | unknown yet | To be examined |
| Akshar Unicode | already Unicode, needs no converter | - |
