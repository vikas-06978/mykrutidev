# MyKrutiDev

Free Hindi font converters and typing tools, in English and Hindi, at
[mykrutidev.com](https://mykrutidev.com).

Many Indian offices, typing exams and DTP shops still use old "legacy" Hindi
fonts such as Kruti Dev, where Hindi is stored as English letters
(`Hkkjr` for भारत). Phones, email and government portals need Unicode Hindi.
This site converts between the two correctly (matra order, reph, half letters
and conjuncts), including whole Word files, and teaches Hindi typing on the
Remington layout that exams use.

## What is on the site

| | Pages |
| :-- | :-- |
| **Converters** | Kruti Dev ↔ Unicode (the home page) · Kruti Dev ↔ Mangal · DevLys ↔ Unicode · DevLys ↔ Mangal · Kruti Dev ↔ DevLys · Abbasi Chanakya ↔ Unicode, Mangal, Kruti Dev and DevLys (beta) · Preeti (Nepali) ↔ Unicode and Kruti Dev (beta) |
| **Word files** | Upload a `.docx` or `.txt` on the Kruti Dev ↔ Unicode and Kruti Dev ↔ Mangal pages. Only the Hindi changes, and English, tables and formatting stay as they were. |
| **Typing** | Typing tutor and timed tests, Hindi typing test for exams, on-screen Hindi keyboard, Remington keyboard, English to Hindi (Hinglish) typing |
| **Printables** | Keyboard chart, finger chart, matra and conjunct chart, practice sheets, progress log (free PDFs) |
| **Help** | 8 guides (font not installed, boxes or question marks, Word files, exam tips...) and pages on Kruti Dev 010, typing Hindi in MS Word and more |

Every page exists in English at `/page` and in Hindi at `/hi/page`. Converters
that are not verified yet are listed as "coming soon" and hidden from search
engines.

**Privacy:** conversion happens in the visitor's browser, so text and files are
not uploaded, and the converters work offline once visited. The one exception
is Hinglish typing, which asks Google's input service how to spell each word.
The feedback form sends what the person writes in it, plus the basic page and
device details listed in the site's privacy policy. Google Analytics counts
visits on the live site only (`src/lib/analytics.js`), and never sees the text or
files.

## Getting started

You need [Node.js 24](https://nodejs.org) (the version is in `.nvmrc`).

```sh
npm ci               # install everything (first time, or after package.json changes)
npm run dev          # start the site at http://localhost:4321
```

The page reloads as you edit. Stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd>.
If it says another dev server is already running, run `npx astro dev stop`.

## How do I...

**Change the words on a page?**
Every word on the site is in two files: `src/i18n/en.json` (English) and
`src/i18n/hi.json` (Hindi), under the same key. A page's text is under
`pages["/its-path"]`. Change both files, then run `npm test`. It fails if a key
is missing in one language, or if a link, code example or `{placeholder}`
differs between them.

**Add a new page?**
1. Add it to `PAGES` in `src/lib/routes.js` (its path, kind and related pages).
2. Add its text under `pages["/new-path"]` in both `en.json` and `hi.json`.
3. Copy a small page file, such as `src/pages/kruti-dev-to-mangal.astro`, to
   `src/pages/new-path.astro` and change the path in it.
4. Run `npm run build` and commit the new share images it draws in `public/og/`.

The Hindi page and the sitemap entry follow automatically.

**Write a new guide?**
Add its slug, date and three related tools to `GUIDES` in `src/lib/guides.js`,
and its title, description and body under `articles["the-slug"]` in both JSON
files. Then run `npm run build` (it checks each guide has at least 550 words in
both languages) and commit the new share images in `public/og/`.

**Change the ToolMitra links page (`/links`, the Instagram bio link)?**
The apps it shows first (MyKrutiDev, MemeBox), the MyKrutiDev tools below them
and the Instagram handle are in `src/lib/brand.js`, its words under `links` in
both JSON files. An app with an empty `href` shows "Coming soon". Once MemeBox
is on the Chrome Web Store, put its address there. The "Follow on Instagram" button appears once
`INSTAGRAM` holds the handle (without the @). Tool requests sent from its form
show on `/admin/feedback`, under the feedback, with their own CSV download.

**Change a printable chart?**
Edit it, then run `npm run pdfs` and commit the new files in `public/downloads/`.

**Check everything before pushing?**
```sh
npx playwright install chromium # once: the browser the build and the browser tests use
npm test                        # unit tests: converters, typing, translations, feedback API
npm run test:functions          # bundle the Pages Functions the way Cloudflare does
npm run build                   # the real build, then the SEO checks
npm run test:dist               # checks on the built site
npx playwright test             # browser tests on phone and desktop
```
GitHub runs the same steps on every push and pull request
(`.github/workflows/test.yml`), so a broken change shows up as a red check.

## All commands

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Local dev server |
| `npm run build` | Build the site into `dist/`. Draws the PDFs and share images first and runs the SEO checks after. |
| `npm test` | Unit tests |
| `npm run test:dist` | Checks on the built site in `dist/` |
| `npm run test:functions` | Bundle the Pages Functions (`functions/`) with wrangler 3, as Cloudflare does, and with the current wrangler |
| `npm run admin-labels` | Regenerate `server/adminLabels.js` after changing the feedback labels in `en.json` |
| `npx playwright test` | Browser tests on the built site |
| `npm run pdfs` / `npm run og` | Redraw the printable PDFs / the share images |
| `npm run favicon` | Redraw the browser-tab icon (`public/favicon.svg` and `.ico`) |
| `npm run i18n:review` | Regenerate `docs/TRANSLATIONS-REVIEW.md` (every string in both languages, side by side) |
| `npm run preview:cf` | Build and run on Cloudflare's local runtime, with the feedback API |
| `npm run lighthouse` | Lighthouse scores per page type |

## Deploying (Cloudflare Pages)

1. In Cloudflare, go to **Workers & Pages**, then **Create**, then **Pages**, and connect this repository.
2. Build settings: build command `npm run build`, output directory `dist`.
   Node comes from `.nvmrc`.
3. Deploy. The build also writes `dist/_headers` (security and caching
   headers), which Cloudflare applies by itself.

On Cloudflare the PDFs and share images are not redrawn (there is no browser
to draw them). The copies committed in `public/` are used, so commit them
after changing a chart or a page title.

The feedback form needs a D1 database, Turnstile and an admin key. See
[docs/FEEDBACK.md](docs/FEEDBACK.md).

**Support by UPI (optional).** To switch on the "Support MyKrutiDev" page and
its footer link, add one environment variable in the Pages project
(**Settings**, then **Variables and Secrets**, for Production, type Text), then
redeploy:

- `PUBLIC_UPI_QR`: the text inside the official QR code your UPI app made
  (scan it with Google Lens or any QR reader: it starts with `upi://pay?pa=`).
  Use this for a **business (merchant) ID**. Its QR carries a merchant code
  and a signature, and PhonePe refuses a merchant QR without them.
- or `PUBLIC_UPI_ID`: just the ID, for example `12345678@upi`. Enough for a
  personal ID.

Neither is ever in this repository. Without them, `/support` shows only the
other ways to help and nothing links to it. A value that is not a UPI QR or ID
stops the build, so a typo can never go live. After switching it on, pay
yourself ₹1 from another person's phone, with both the QR code and the phone
button, to check.

**Before launch:** if the domain is not `mykrutidev.com`, change `SITE` and
`CONTACT_EMAIL` in `src/lib/routes.js` (canonical links, sitemap, share
previews and the contact address all come from there).

## Project structure

```text
src/
  pages/         One file per URL. The Hindi site is src/pages/hi/, with the same slugs.
  components/    Converter, document converter, typing tutor, keyboard, header, footer...
  layouts/       The page shell (Base.astro)
  lib/           The engine: font maps and conversion, .docx handling, typing,
                 transliteration, routes and page data. Each file's tests sit next to it.
  i18n/          Every word on the site, in en.json and hi.json, and their tests
  styles/        Global styles, design tokens and themes
  scripts/       Browser scripts shared by pages (offline, feedback panel...)
  pwa/           Build step: the offline service worker
  security/      Build step: security and caching headers (dist/_headers)
server/          Feedback API and admin page, with their tests
functions/       Cloudflare Pages Functions (thin entry points into server/)
db/              D1 schema for feedback
public/          Files served as they are: fonts, PDFs, share images, icons
scripts/         Build helpers: PDFs, share images, the local test server
tests/           Checks on the built site (SEO, pages, feedback)
e2e/             Playwright browser tests and Lighthouse
vendor/          Source material for font mappings (not published)
docs/            Design system, feedback setup, font notes, translation review
```

## Docs

- [docs/DESIGN.md](docs/DESIGN.md): the design system and its rules
- [docs/FEEDBACK.md](docs/FEEDBACK.md): the feedback form and its Cloudflare setup
- [docs/FONTS.md](docs/FONTS.md): the preview font files and their licences
- [docs/TRANSLATIONS-REVIEW.md](docs/TRANSLATIONS-REVIEW.md): every English and Hindi string side by side (generated)

## Licence

Copyright MyKrutiDev. All rights reserved. See [LICENSE](LICENSE).
