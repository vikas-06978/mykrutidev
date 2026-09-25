// `npm run screenshots`: the four busiest pages in Light, Dark and Reading, on
// desktop and phone, saved to screenshots/. Same server and projects as the
// test config; only the file it runs differs.
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/screenshots.spec.js',
});
