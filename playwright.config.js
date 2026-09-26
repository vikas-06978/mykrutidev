// End-to-end tests: a real browser types into every tool page of the BUILT
// site, in English and under /hi/. Run with `npm run test:e2e` (builds first).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4401;
// Point the suite at another server (e.g. the dev server) with
// E2E_BASE_URL=http://localhost:4321 - then no server is started here.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  // Pictures for a human, not assertions: `npm run screenshots`.
  testIgnore: '**/screenshots.spec.js',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // The built site registers a service worker, which would answer requests
    // before page.route() sees them. Only e2e/app.spec.js, which tests the
    // worker itself, lets it run.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        // Serves dist/ exactly as a static host would (see e2e/serve.mjs).
        command: `node e2e/serve.mjs ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
