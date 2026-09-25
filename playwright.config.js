// End-to-end tests: a real browser types into every tool page of the BUILT
// site, in English and under /hi/. Run with `npm run test:e2e` (builds first).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4401;

export default defineConfig({
  testDir: 'e2e',
  // Pictures for a human, not assertions: `npm run screenshots`.
  testIgnore: '**/screenshots.spec.js',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Serves dist/ exactly as a static host would (see e2e/serve.mjs).
    command: `node e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
