# MyKrutiDev

Free Hindi font converters and typing tools, in English and Hindi, at
[mykrutidev.com](https://mykrutidev.com).

- **Converters** between Kruti Dev, DevLys, Mangal, Unicode and Abbasi
  Chanakya, with the matra order, reph and conjuncts handled correctly.
- **Word file conversion** (.docx and .txt) that changes only the Hindi and
  keeps English, tables and formatting as they were.
- **Typing tools**: a Remington typing tutor and timed tests, an on-screen
  Hindi keyboard, English to Hindi (Hinglish) typing, and printable charts
  and practice sheets.
- **Guides** to the problems people bring: fonts showing as English letters,
  boxes or question marks, Word files, exam typing.

Everything runs in the browser, and the converters keep working offline once a
page has loaded. Text and files are not uploaded. The one exception is
Hinglish typing, which asks Google's input service how to spell each word, as
the privacy policy explains.

## Tech

[Astro](https://astro.build) (static output) and Tailwind CSS v4, hosted on
Cloudflare Pages. The feedback form is the only server part: a Pages Function
with a D1 database and Turnstile.

## Getting started

Needs Node 24 (see `.nvmrc`).

```sh
npm install
npm run dev          # http://localhost:4321
```

## Commands

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build to `dist/`: also draws the PDFs and share images first, and runs the SEO checks after |
| `npm test` | Unit tests: converters, typing, translations, feedback API |
| `npm run test:dist` | Checks on the built site in `dist/` |
| `npx playwright test` | Browser tests on the built site (phone and desktop) |
| `npm run i18n:review` | Regenerates `docs/TRANSLATIONS-REVIEW.md` |
| `npm run preview:cf` | Build and run locally on Cloudflare's runtime, with the feedback API |
| `npm run lighthouse` | Lighthouse scores per page type |

CI (`.github/workflows/test.yml`) runs `npm test`, `npm run build`,
`npm run test:dist` and the browser tests on every push and pull request.

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
