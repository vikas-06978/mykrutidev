// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import { SITE, isIndexable } from './src/lib/routes.js';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Static output. No adapter, no SSR — the whole product runs in the browser.
  integrations: [
    sitemap({
      // Stub routes carry `noindex`; keeping them out of the sitemap too means
      // we never ask Google to crawl a page we are telling it to ignore.
      filter: isIndexable,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
