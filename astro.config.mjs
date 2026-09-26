// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import { SITE, isIndexable } from './src/lib/routes.js';
import pwa from './src/pwa/integration.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // English at the root, Hindi under /hi with the same slugs. Every page is
  // built in both languages at build time - no runtime translation. See
  // src/i18n/index.js and src/pages/hi/[...slug].astro.
  i18n: {
    locales: ['en', 'hi'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  // The stylesheet (~12 KB gzipped) goes inside each page instead of in a file
  // the page has to wait for: one round trip less before the first paint on a
  // slow phone connection (Lighthouse FCP 2.3-2.5 s with the file).
  build: { inlineStylesheets: 'always' },
  // Static output. No adapter, no SSR — the whole product runs in the browser.
  integrations: [
    sitemap({
      // Stub routes carry `noindex`; keeping them out of the sitemap too means
      // we never ask Google to crawl a page we are telling it to ignore. The
      // filter strips the /hi prefix, so the rule is the same in both languages.
      filter: isIndexable,
      // Each entry lists its other-language twin (hreflang en / hi).
      i18n: { defaultLocale: 'en', locales: { en: 'en', hi: 'hi' } },
    }),
    // Installable app: writes dist/sw.js, which keeps every page, font and
    // script available offline. See src/pwa/.
    pwa(),
  ],
  // `npm run pdfs` builds the site into a scratch folder to print the PDFs
  // from (scripts/pdfs.mjs); the PDFs themselves land in public/downloads/.
  ...(process.env.MKD_PDF_BUILD ? { outDir: process.env.MKD_PDF_BUILD } : {}),
  vite: {
    plugins: [tailwindcss()],
    // Every dependency that is only reached through a lazy import() must be
    // listed here. Otherwise Vite discovers it late, re-optimises, and answers
    // the page's request with "503/504 Outdated Optimize Dep":
    //  - fflate: docConvert.js / docx.js, loaded when a file is dropped;
    //  - sanscript: translit.js, loaded when someone types on English to Hindi
    //    Typing. Missing, it left that page's output blank in dev.
    // Bundling them up front means those requests can never be stale.
    // src/lib/optimizeDeps.test.js checks the list against the source.
    optimizeDeps: { include: ['fflate', '@indic-transliteration/sanscript'] },
  },
});
