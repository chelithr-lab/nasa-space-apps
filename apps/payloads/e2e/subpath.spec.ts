// Hosting under a sub-path (VITE_BASE). Runs only when SUBPATH_URL points at a preview built with that base,
// e.g. SUBPATH_URL=http://127.0.0.1:5180/lunar/ (see README).
import { expect, test } from '@playwright/test';

const base = process.env.SUBPATH_URL;

test.skip(!base, 'set SUBPATH_URL to a build made with VITE_BASE to run this check');

test('catalogue, article, tabs and search work under the sub-path', async ({ page }) => {
  await page.goto(`${base}`);
  await expect(page.locator('.home .tile')).toHaveCount(16);
  await page.goto(`${base}payload/13`);
  await expect(page.locator('h1.pd-title')).toHaveText('Fluxgate magnetometer');
  await page.getByRole('tab', { name: 'Description' }).click();
  await expect(page.locator('[role=tabpanel]:not([hidden]) .prose').first()).toBeVisible();
  await page.goto(`${base}search?q=apxs`);
  await expect(page.locator('.result-group .card')).toHaveCount(1);
});
