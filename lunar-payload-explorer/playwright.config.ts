import { defineConfig } from '@playwright/test';

// PW_CHANNEL=chrome uses an installed Google Chrome instead of Playwright's bundled browser.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Two workers keeps the axe scans and the long category walk within their time limits on a laptop.
  workers: process.env.CI ? 1 : 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:5174/',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
