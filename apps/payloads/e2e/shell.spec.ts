import { expect, test } from '@playwright/test';

// Phase 1 exit check: the shell (header, footer, skip link) renders on every route.
const routes = ['/', '/categories', '/payload/13', '/no-such-page'];

for (const route of routes) {
  test(`shell renders on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('header.app-header')).toBeVisible();
    await expect(page.locator('footer.app-footer')).toBeVisible();
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#app');
  });
}

test('legacy hash links are rewritten to clean URLs', async ({ page }) => {
  await page.goto('/#/payload/13?tab=images');
  await expect(page).toHaveURL(/\/payload\/13\?tab=images$/);
});
