import { defineConfig } from '@playwright/test';

// Integration tests for the assembled site. The site is built and served on port 8095 (tools/build-site.mjs, tools/serve.mjs).
// PW_CHANNEL=chrome uses an installed Google Chrome instead of Playwright's bundled browser.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8095',
    channel,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tools/build-site.mjs && node tools/serve.mjs',
    url: 'http://127.0.0.1:8095/',
    reuseExistingServer: !process.env.CI,
    timeout: 900_000,
  },
});
