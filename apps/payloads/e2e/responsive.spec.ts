// Phone layout (AC7): no horizontal scroll, single column, tabs become a dropdown.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

const pages: Array<{ path: string; name: string }> = [
  { path: '/', name: 'home' },
  { path: '/category/1', name: 'category' },
  { path: '/payload/1', name: 'payload' },
  { path: '/search?q=radar', name: 'search' },
];

for (const { path, name } of pages) {
  test(`AC7 ${name} at 375px: no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('header.app-header')).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}

test('AC7 category grid is a single column at 375px', async ({ page }) => {
  await page.goto('/category/1');
  const columns = await page.locator('.grid--cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
});

test('AC7 payload tabs become a dropdown, and the dropdown switches the section', async ({ page }) => {
  await page.goto('/payload/1');
  await expect(page.locator('.tabs__select')).toBeVisible();
  await expect(page.locator('.tabs__bar')).toBeHidden();
  await page.locator('.tabs__select').selectOption({ label: 'Physical Specifications' });
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('Physical Specifications');
});
