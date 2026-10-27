# AdSense "low value content": content and reliability audit

Date: 27 October 2026. Branch `audit/adsense-low-value-content`, from `origin/main` at `9a91c1f`.

Google gave no page and no reason beyond "low value content". **This audit does not know Google's actual cause and does not claim to.** It looks for real defects and for things a reviewer could reasonably call low value, fixes the ones the evidence supports, and says plainly what it could not check. Nothing here promises approval.

## 0. Limits of this audit (read first)

| Limit | Effect |
| --- | --- |
| `https://mykrutidev.com` is unreachable from the audit environment (the HTTPS proxy refuses it). | **Nothing was checked on the live site.** Whether any fix, or any earlier fix, is live is **unverified**. Everything below was measured on a local production build of `origin/main` (`npm run build`), served with the real `_headers` and `_redirects`. |
| The AdSense and Publisher Policy pages were blocked at first and read later, once `support.google.com` was allowed. `developers.google.com` is still blocked. | Section 7 quotes the pages that were read. The Google Search spam-policy page itself was not read. |
| No Search Console access. | Indexing, crawl status, coverage and any manual action are **unverified**. |
| `fix/adsense-content-quality` and commit `ac766cf` are not in this repository (`git branch -a`, `git cat-file`). | They were not reviewed. Nothing was assumed deployed. See section 6. |
| Translations were checked by script only. | No human-language review. Section 3, finding P5. |
| `CLAUDE.md` is a symlink to `AGENTS.md`, and `AGENTS.md` does not exist. | No repository instruction file could be read. Recorded as F5; not "fixed" by inventing instructions. |

## 1. Inventory

Sources: `dist/sitemap-0.xml`, `src/lib/routes.js` (117 entries, 115 live) and the 897 built HTML files.

- **861 indexable URLs** (all in the sitemap), **7 languages** (en, hi, bn, mr, ta, gu, pa), 123 English routes.
- 36 built pages are deliberately outside the sitemap: `/links`, `/support`, `/store/thanks` and `/store/sample-test` (noindex, 28 URLs), the alias `/hindi-font-converter` (canonical to `/`, 7 URLs) and the 404.
- Sitemap and HTML agree both ways (no sitemap URL without a page, no noindex page in the sitemap).

Live pages by type (English routes; every one exists in all 7 languages):

| Type | Pages | Examples |
| --- | --- | --- |
| Font to Unicode converters | 68 | `/` (Kruti Dev), `/devlys-to-unicode`, `/ajay-to-unicode`, `/unicode-to-himalaya` |
| Font to font converters | 8 | `/kruti-dev-to-abbasi-chanakya`, `/kruti-dev-to-devlys` |
| Content pages that host a converter | 3 | `/kruti-dev-010-font`, `/remington-hindi-keyboard`, `/hindi-font-converter` (alias) |
| Everyday tools and typing apps | 20 | `/hindi-typing-test`, `/hindi-word-counter`, `/number-to-hindi-words`, `/kruti-dev-excel-to-unicode`, six Hindi-to-script pages |
| Printable PDF pages | 7 | `/kruti-dev-keyboard`, `/hindi-typing-practice-sheets` |
| Guides (articles) | 8 + index | `/guides/install-kruti-dev-010-font-windows` |
| Policy, about, contact | 6 | `/about`, `/privacy-policy`, `/terms`, `/refund-policy`, `/delivery-policy`, `/contact` |
| Store | 2 | `/store`, `/store/kruti-dev-7-day-starter` |
| Hub | 1 | `/all-converters` |

Ads are **off in the build**: no `adsbygoogle`, `pagead2` or `googlesyndication` string in any of the 897 pages; the `google-adsense-account` meta tag (`ca-pub-4508143583458824`) is on every page and `/ads.txt` has the one DIRECT line. Whether the **live** deployment has `PUBLIC_ADSENSE_ADS` unset is **unverified** (it is a Cloudflare Pages variable, not in the repository).

## 2. A. Confirmed defects

| ID | Where | Evidence and reproduction | Impact | Status |
| --- | --- | --- | --- | --- |
| **F1** | `public/fonts/ajay.woff`, `aman.woff`, `ruchi.woff`. Pages: `/unicode-to-ajay`, `/unicode-to-aman`, `/unicode-to-ruchi` in all 7 languages (21 URLs), and any page that previews text in those fonts. | Crawling all 897 routes in Chromium (1,794 loads, desktop and phone) logged `Failed to decode downloaded font: /fonts/ajay.woff` (also aman, ruchi) and `OTS parsing error: cmap: language id should be zero` on those pages. `new FontFace(...).load()` rejects exactly these 3 of 37 shipped fonts. Cause: every `cmap` subtable has `language` 1; Ruchi's `kern` entry selector is 1 for 4 pairs (needs 2). | Chrome drops the font. The "Preview (Hindi)" of the output shows raw legacy keys (`Hkkjr`) in a fallback font instead of Hindi. Word and the copy and download buttons are not affected. | **Fixed.** `scripts/webfont.mjs` repairs only those header bytes (2 bytes of `cmap`, 3 of `kern`, plus the whole-file checksum). Glyphs, metrics, names and all character-map entries are byte-identical. Rendered in Chromium: all three draw `भारत हिंदी`. Regression tests: `src/lib/fontFiles.test.js` (every font, plus a deliberately broken one) and `e2e/fonts.spec.js` (loads every font in Chromium). Both fail on the old files. |
| **F2** | `src/components/PageView.astro` (the privacy policy's advertising section). | `maybe()` returns the dictionary's own array (`maybe('en', ...) === maybe('en', ...)` is `true`). `rawBody.splice(...)` edited it in place, so every further render of the page in one process adds the section again. The production build renders each page once, so `dist/` has one section (17 headings in `/privacy-policy/`). | Latent: a duplicated advertising section on the dev server or any second render. Invisible in the shipped files today. | **Fixed.** `withAdsBody()` in `src/lib/ads.js` returns a new list. Tests render the real policy of all 7 languages 3 times and assert the dictionary never grows. |
| **F3** | `src/i18n/*.json` (`article.author`, `article.authorBio`, `guidesIndex.lede`, `pages./contact.description`) and `src/components/GuideArticle.astro` (JSON-LD). 8 guides x 7 languages, plus 7 guide indexes and 7 contact descriptions. | Every guide was bylined "MyKrutiDev team" ("the people who build and test the converters...") and its Article data declared `author: { @type: Organization, name: "MyKrutiDev team" }`. The About page says the site is "independently developed and maintained by Vikas Rathore", and `docs/ADSENSE.md` says the About page names the maintainer rather than claiming a team. "Every rule in these guides is checked ... before it is published" was a claim the code does not back. | Author identity contradicts the About page, which is what a reviewer reads for who is behind a site. | **Fixed.** Byline and Article author are now the maintainer's name as the About page spells it in each language, as `Person`. The bio states only what About already says (independent developer and maintainer; the Kruti Dev keyboard chart is read out of the font file). Contact and guide-index wording no longer says "team". Tests: `src/i18n/i18n.test.js`, `tests/seo.test.js`. No credentials or experience were added. |
| **F4** | `src/lib/ads.js` (`NO_ADS`). | `/all-converters` (213 links, nearly all text is other pages' blurbs) and `/guides` (121 links, 378 words) were not excluded, so fixed ad units and the loader would have been allowed on pages that are only a list of links. | Latent: ads are off. If switched on, a policy problem (ads on pages with little publisher content). | **Fixed.** Both added; a guide article itself stays eligible. Test in `src/lib/ads.test.js`; `docs/ADSENSE.md` updated. |
| **F5** | `CLAUDE.md` -> `AGENTS.md` | `ls -la CLAUDE.md` shows a symlink to a file that is not in the repository. | No repository instructions load for a coding agent. Not a site defect. | **Not changed.** Needs the owner to restore or replace `AGENTS.md`. |

## 3. B. Possible low-value-content contributors (not confirmed)

These are things a reviewer could weigh against the site. None is proved to be the cause.

**P1. Many converter pages built on one engine, with family-templated copy.** 76 converter pages (68 + 8) for 34 fonts, 79 URLs per language with the 3 hosts.

- Rendered text, English, 6-word shingles shared with 10 or more other pages: median 40% of a page, up to 73%. The 20 least unique pages are all legacy-font pages of one keyboard family (`/arjun-to-unicode` 12% unique, `/ajay-to-unicode` 13%, `/kundli-to-unicode` 13%, `/anjali-to-unicode`, `/narad-to-unicode`, `/aakriti-to-unicode`, `/krishna-to-unicode`...). In Hindi the same pages are 7 to 10% unique. 198 English page pairs share at least half their text (`dup.py`, section 5).
- The maps behind them overlap: Kruti Dev and DevLys have identical base maps (153 of 153 entries), Krishna/Aman 197 of 201, Shusha/Shivaji 170 of 173, LMG Arun/Terafont 147 of 150, and many fonts share 85 to 98% of their entries because they share a keyboard.
- Functional aliases, measured on the engine: the four `*-mangal` pages give the same output as the Unicode pages (101 of 101 Kruti Dev inputs, 124 of 124 Unicode corpus lines), because Mangal is a Unicode font; Kruti Dev to DevLys and back returns its input unchanged (101 of 101).
- In their favour: each page has copy specific to its font (for example Agra Bold, Wide and Thin are stated as not covered; `=` is half tra in Ajay and Arjun), the alias pages say plainly that Mangal is a font and DevLys shares Kruti Dev's keys, and each is its own search task ("Ajay to Unicode"). **Not consolidated, redirected or noindexed**: the evidence shows overlap, not a page with no purpose, and removing honest pages would be hiding, not improving.

**P2. No visible, checked examples or limits on converter pages.** Before this change a converter page had one "Try example" button (JavaScript) and prose. *Addressed*, see section 4.

**P3. 66 of 115 live pages carry a "Beta" badge.** It is honest (the maps are read off font files but not all checked against real documents), but more than half of the site reads as unfinished. Left as is.

**P4. Thin or shallow pages.** Fewest rendered words (English): `/store` 130, `/delivery-policy` 165, `/contact` 222, `/refund-policy` 241, `/hindi-to-english-numbers` 250, `/english-to-hindi-numbers` 256, `/hindi-typing-progress-log` 277, `/hindi-word-counter` 282, `/about` 283, `/amount-in-words` 316, six Hindi-to-script pages 319 to 336. The eight guides are 656 to 859 words with Article data and diagrams: decent, but few. Not padded.

**P5. 861 URLs from 123 English routes, translated.** The Hindi file lists 154 strings its author was "not sure about" (`docs/TRANSLATIONS-REVIEW.md`); the other five languages have no review record. Scripted checks found no untranslated English prose (the only English runs are Google's own link title in the privacy policies) and `html lang` matches the URL everywhere, but **translation quality is unverified**. All new strings in this change were written by the same process and are not native-reviewed.

**P6. The site sells its own PDF.** A community guide (third-party, unofficial) advises against AdSense for sites whose main purpose is selling their own products. The store is 2 of 115 pages, and ads never appear on it, but the point is worth knowing. Unverified against official policy.

**P7. Newness and traffic.** Unknown from here.

**P8. Tool first, prose after.** On converter pages the explanatory text sits below the tool and FAQ. Intentional, kept.

## 4. What was changed

| Change | Files |
| --- | --- |
| Repair of three webfonts, with a checker and tests | `scripts/webfont.mjs` (new), `public/fonts/{ajay,aman,ruchi}.woff`, `src/lib/fontFiles.test.js` (new), `e2e/fonts.spec.js` (new), `docs/FONTS.md` |
| "Worked examples" and "Good to know" on all 79 converter pages (553 URLs): 5 phrases per page produced by the real conversion code and **dropped unless they convert back correctly in both directions** (4 of 5 on Anjali); the colon rule of the Kruti Dev keyboard and the letters an output font has no key for, read off the code | `src/lib/converterExamples.js`, `src/components/ConverterExamples.astro`, `src/components/PageView.astro`, `src/i18n/*.json` (`examples.*`, 14 keys x 7 languages), `src/lib/converterExamples.test.js` (94 tests), `tests/dist.test.js` |
| Independent check for the Kruti Dev and DevLys examples: 41 pairs typed from the Kruti Dev keyboard rules, not copied from the converter's output | `src/lib/__fixtures__/independent-kruti-dev.json` |
| Non-mutating privacy-policy ads section | `src/lib/ads.js`, `src/components/PageView.astro`, `src/lib/ads.test.js` |
| Hub pages excluded from ads | `src/lib/ads.js`, `src/lib/ads.test.js`, `docs/ADSENSE.md` |
| Guide authorship consistent with About | `src/i18n/*.json`, `src/components/GuideArticle.astro`, `src/i18n/i18n.test.js`, `tests/seo.test.js` |

The added examples are data, not prose: every row is a legacy-font string and its Unicode result. They add roughly 300 words per page, none of it written by hand. No page was added, removed, redirected or noindexed. The converters' mapping logic was not touched.

**What the "Good to know" block says, and why it is true.**

- On pages that cross the Kruti Dev keyboard: the colon of `विषय:` is typed with the visarga key (the colon key draws `रू`), so legacy to Unicode returns the visarga `ः`, which looks like a colon but is another character. `fontMaps.js` does exactly this on purpose (`withColon`); `converterExamples.test.js` asserts all three facts against the engine.
- On pages whose output font lacks keys (Himalaya, Dina, Anjali and the other Nepali-keyboard fonts have no nukta key; Abbasi Chanakya has none for `ॐ`, `ऌ`, `॥`): the list is computed by `unmappedChars()`, the same function that triggers the warning under the output box.

## 5. Evidence and method

- **Technical SEO (local build, 861 indexable URLs):** canonical equals own URL on all; exactly one `h1`; no missing or duplicate title or description; titles 70 characters at most; hreflang complete (7 languages and `x-default`), self-referencing and reciprocal; every hreflang target built and in the sitemap; JSON-LD parses everywhere; 0 broken internal links; 0 images without `alt`; `robots.txt` allows `/`, blocks `/api/`, names the sitemap.
- **Browser crawl:** 1,794 page loads (897 routes x desktop 1280 and Pixel 7) under the real CSP: 0 failed requests, 0 responses of 400 or more (except the deliberate 404 probe), 0 horizontal overflow, 0 fixed overlays covering more than 15% of the screen, 0 unnamed controls, 0 broken images or anchors. The only console messages were F1. Observation only: 16 px native checkboxes and a 20 px-high breadcrumb link are smaller than WCAG 2.2's 24 px target; the skip link is visually hidden until focused. Not changed.
- **Converters, independent fixtures:** 39 Kruti Dev to Unicode pairs written from typing rules, 39 of 39 forward, 39 of 39 round trip, 5 of 5 mixed English and Hindi (English guard). (One first-run failure was a typo in the fixture, `'V` for `"V`; the converter was right.)
- **Converters, in a browser:** every live converter page driven in Chromium: "Try example", output compared with the engine, Copy, and the `.docx` download (the XML read back): 200 of 200 probes on desktop and phone, in English for all 76 pages and the other 6 languages for 8 pages. A first run showed 77 clipboard mismatches; they were my parallel runs sharing one clipboard. Run one at a time: 0 of 200.
- **Round trip on a 124-line Hindi corpus, per font:** Kruti-keyboard fonts 116 of 124, Preeti 111, DV-TT 114, Shusha family 120; all misses explained: the colon rule above, the missing nukta key, curly quotes and Hindi digits in some fonts. These are limits the pages now state, not new defects.
- **Not tested:** real Word documents rendered with the real fonts; real Kruti Dev documents beyond the fixtures (see `docs/qa/upload-qa-2026-10-15.md`: 117 of 128 file cases BLOCKED for lack of genuine Kruti Dev seeds); Excel conversion beyond the existing e2e suite; screen readers; native-speaker review of any language.

## 6. The earlier fixes (branch not available)

| Earlier fix | State on `main` before this change | Now |
| --- | --- | --- |
| Conflicting font instructions | No contradiction found by script or reading; the branch that targeted it is unavailable. **Unverified.** | Unchanged |
| Five conversion examples | Not on `main` (one "Try example" button only) | Added in a different, checked form (section 4) |
| Maintainer bylines | About names the maintainer; the guides did not (F3) | Fixed |
| Ad eligibility restrictions | Present (`NO_ADS`, `adsAllowedOn`, loader guarded by it); hubs missing (F4) | Completed |
| Privacy-policy array mutation | Present and unfixed (F2) | Fixed |

## 7. Policy sources (read on 27 October 2026, after the first pass)

The pages below were fetched and read in full once the network policy allowed `support.google.com`. `developers.google.com` (Search spam policies) was still blocked, so that page is **not** read; the thin-content text comes from the Search Console manual-actions page.

- AdSense content and user experience: <https://support.google.com/adsense/answer/10015918>
  - "make sure that your pages have enough unique content so that we can determine what your site is about"
  - "If you have many pages that are similar or have very similar content, consider expanding each page or consolidating the pages into one."
  - "Continually adding new and unique content will keep your site fresh and generate more returning visitors."
  - Spam policies "recommend that you do not use cloaking and doorway pages, pages with little to no content, or pages optimized for specific keywords or phrases."
- Inventory value, ads on screens without publisher content: <https://support.google.com/publisherpolicies/answer/11112688>
  - "We do not allow Google-served ads on screens without publisher-content or with low-value content"; "Ads should not be placed on 'dead end' or no content screens (e.g., Thank You, Exit, Error pages)"; "Don't place ads on automatically generated content without manual review or curation."
- Replicated content: <https://support.google.com/publisherpolicies/answer/11190248> ("Automatically generated content without manual review or curation"; "Sites that copy content ... modify it slightly ... using automated techniques").
- Spam policies tip page: <https://support.google.com/publisherpolicies/answer/11035931> ("doorway pages ... or other 'cookie cutter' approaches ... with little or no original content").
- Unsupported languages: <https://support.google.com/publisherpolicies/answer/10436912>. English, Hindi, Bengali, Marathi, Tamil, Gujarati and Punjabi are all on the supported list, so **language is not a blocker**.
- Publisher Policies index: <https://support.google.com/adsense/answer/10502938>. Thin content with little or no added value (Search Console manual actions): <https://support.google.com/webmasters/answer/9044175> (examples: thin affiliate pages, scraped content, doorways).

What the text means for this site, as a reading and not as Google's decision:

- It supports P1 and P4: similar pages should be expanded or consolidated, and pages with little content are a stated concern.
- It supports keeping ads off Thank-you and error pages (the site already does).
- **New caution on this change.** "Automatically generated content without manual review or curation" is named. The Worked-examples rows are generated by code, but every row is checked by tests and an independent fixture, and a person reviewed the design. The five newer languages' strings and the machine-drafted translations have no native review (P5). Treat them as a risk until reviewed.
- None of the pages states a numeric threshold, and none says anything about traffic. The rejection message's "consistent presence" and "sustained user interest" cannot be fixed in code.

## 8. Tests

| Command | Result |
| --- | --- |
| `npm test` | 2587 passed, 0 failed |
| `npm run test:functions` | passed |
| `npm run build` (includes the 24 SEO tests) | exit 0, SEO 24 of 24 |
| `npm run test:dist` | 112 tests: 109 passed, 3 skipped, 0 failed |
| `npx playwright test --workers=4` (desktop and mobile) | 1794 passed, 295 skipped (by the specs themselves), **3 failed** |

The 3 failures were `convert-modes.spec.js` "?mode=file opens the Upload tab", `tools.spec.js` "/gu/kruti-dev-to-abbasi-chanakya: typing gives output" and (mobile) `theme.spec.js` "each accent ... recolours". Re-run alone with 1 worker, all 3 pass (desktop and mobile). They are timing failures under 4 parallel workers; none touches code changed here. This is a re-run, not a diagnosis of the original timeout. CI is the check that counts.

## 9. Remaining checks and blockers

1. **Confirm the live site.** Open `/ads.txt`; view source of any page and confirm no `adsbygoogle`; in Cloudflare Pages confirm `PUBLIC_ADSENSE_ADS` and `PUBLIC_ADSENSE_SLOT` are unset in Production (and Preview).
2. **Search Console:** coverage, any manual action or security issue, and the sitemap `https://mykrutidev.com/sitemap-index.xml`.
3. **Read the official AdSense policies** (section 7) and judge P1, P3, P4 and P6 yourself.
4. **Decide on the Beta label and the families of near-identical converter pages** (P1, P3). The code supports either keeping them, or later noindexing a family, but that is a product decision, not a defect.
5. **Native-speaker review** of the five newer languages and of the new strings.
6. **Restore `AGENTS.md`** (F5).
7. After deploy, open one `/unicode-to-ajay/` page in Chrome and confirm the preview shows Hindi.

## 10. Before reapplying

Deploy this branch, then wait. Re-check items 1 to 3 above, and review the pages as a stranger would: the home page, one converter page, a guide, About and Contact. Reapply only when you can say, for each page a reviewer might open, what it gives a visitor that they could not get elsewhere. Approval is not guaranteed by anything in this repository.
