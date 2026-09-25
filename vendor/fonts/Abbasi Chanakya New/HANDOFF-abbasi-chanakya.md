# Handoff: Abbasi Chanakya New → Unicode converter

## Why this exists
The earlier "Chanakya" mapping could never be verified because every font file we tried was either an icon font (Radcom `Font.ttf`/`Font.woff`, not Hindi) or a different layout. This mapping was built **from a real font file** instead: *Abbasi Chanakya New* (Jamal Abbasi, 2010, 172 glyphs). Every glyph was drawn and identified, and every entry was drawn in the font next to the Unicode it produces.

## Page naming (authenticity)
- Ship this as **"Abbasi Chanakya New to Unicode"** (and the reverse direction later), on its own URL, e.g. `/abbasi-chanakya-to-unicode`.
- Keep the generic **"Chanakya / Walkman-Chanakya"** pages on "coming soon". This mapping is for one specific font and differs from Walkman-Chanakya in several keys.
- Use `Abbasi Chanakya New.ttf` (convert to WOFF, `format('woff')`) as the preview font. Do **not** use the Radcom `Font.woff`/`Chanakya.woff`, which is an icon font.

## Files
- `abbasi-chanakya-mapping.json`: the data (multi-char entries, single entries, reorder markers, exclusions, 40 test words). Every entry has a `confidence`: `H` = verified visually, `M` = best reading.
- `abbasi_map.py` + `reference_converter.py`: a small reference implementation. Use it only to compare against; implement in the site's existing converter code.
- `abbasi-chanakya-verification.html`: a visual sheet with the font embedded (key → font drawing → Unicode).

## Implementation rules
1. **Longest match first** across `multi` and `single` together.
2. **Pre-base i-matra:** `f` → `ि` and `Ç` → `िं` are typed BEFORE the consonant cluster. Move them after the whole cluster (consonant + nukta + any `्`+consonant chain). This is the same as the existing Kruti logic.
3. **Post-syllable reph** (typed AFTER the syllable; the `र्` moves BEFORE that syllable):
   - `Z` → reph only
   - `±` → reph + `ं`
   - `Æ` → reph + `ि` (post-typed i-matra with reph, e.g. `dhrÆ` = कीर्ति)
   - `É` → reph + `िं`
   - `Ê` → reph + `ी`
   Emit the sign first, then move `र्` to the start of the syllable.
4. **Differences from the old Chanakya table**, so don't copy these across:
   - `Q` is a full **फ**. `iQ`, `IkQ`, `mQ`, `jQ`, `oQ` are removed.
   - `=` is a full **त्र**. `=k` is **त्रा**, so the old `"=k"->"त्र"` entry is removed.
   - `Ü` is a full **श** (not श्).
   - `_` is **ऋ**. `½` is `)` and `¼` is `(`.
   - `Ý` is फ्र (not `Ú`). `¸` is य् (not `Õ`). `é` is न्न (`Â` doesn't exist in this font).
   - `(` is `;`, `\` is `?`, `-` is `.`, `$` is `+`, `»` is `÷`, `*` is `’`, `^` is `‘`, `ø` is `[`.
   - There are **no Hindi digit keys** (`ƒ „ … †…` don't exist). Digits 0–9 are Latin and pass through. Only `å`/`ú` draw ० (M).
   - `î` and `Ó` are both the `्य` tail (`Nî`/`NÓ` = छ्य).
5. **Not mapped** (leave as-is and log them): `¤`, `§` (an unidentified mark below the letter), `ö` (a wide conjunct with an unclear lower part), and standalone `Ú` (only `Úk` → न is mapped).

## Medium-confidence entries (confirm with a real Abbasi-Chanakya document)
`à`→ह्न, `Úk`→न, `Dk`→क, `å`/`ú`→०, `ñ`→॰

## Tests to add
Use the 40 `tests` in the JSON. Their expected values were produced by the reference converter, and each one was checked by eye against the font drawing (see the verification sheet). Examples: `fgUnh`→हिन्दी, `jk"Vª`→राष्ट्र, `ÅtkZ`→ऊर्जा, `çèkkuea=h`→प्रधानमंत्री, `dhrÆ`→कीर्ति, `fLFkfr`→स्थिति, `vkWfQl`→ऑफिस, `Çlg`→सिंह.

## Before going live
Run the converter on one real document typed in Abbasi Chanakya New, if one can be found, and compare it by eye. Until that's done, label the page "beta".
