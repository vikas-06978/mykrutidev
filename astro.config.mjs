// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

import { SITE, isIndexable } from './src/lib/routes.js';

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
    // The printable PDFs, printed from the built pages at the end of every
    // build (scripts/build-pdfs.mjs). A wrong page count, a non-A4 page, a
    // file of 500 KB or more, or a non-Noto font fails the build.
    {
      name: 'printable-pdfs',
      hooks: {
        'astro:build:done': async ({ dir, logger }) => {
          const { buildPdfs } = await import('./scripts/build-pdfs.mjs');
          await buildPdfs(fileURLToPath(dir), logger);
        },
      },
    },
  ],
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
