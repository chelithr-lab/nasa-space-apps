// Switching tabs must not refetch the article (risk 6.2) and must not add history entries (risk 6.3).
import { expect, test } from '@playwright/test';

test('switching tabs makes no article requests and keeps one history entry', async ({ page }) => {
  await page.goto('/category/1');
  await page.goto('/payload/1');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/payloads/')) requests.push(r.url());
  });

  for (const label of ['Description', 'Operating Principle', 'Limitations']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  expect(requests).toEqual([]);

  await page.goBack();
  await expect(page).toHaveURL(/\/category\/1$/);
});
