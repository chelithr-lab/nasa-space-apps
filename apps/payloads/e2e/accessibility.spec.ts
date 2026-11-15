// Accessibility (NFR-2): axe scans for WCAG 2.2 A/AA on every page and every payload tab.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface Violation {
  id: string;
  impact?: string | null;
  help: string;
}

const blocking = (violations: Violation[]) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const problems = blocking(results.violations).map((v) => `${v.id} (${v.impact}): ${v.help}`);
  expect(problems, label).toEqual([]);
}

test('home, categories, category, search and not-found pages have no serious accessibility violations', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  for (const [path, label] of [
    ['/', 'home'],
    ['/categories', 'categories'],
    ['/category/1', 'category 1'],
    ['/search?q=radar', 'search'],
    ['/no-such-page', 'not found'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await scan(page, label);
  }
});

test('every tab of payload #1 and #13 has no serious accessibility violations', async ({ page }) => {
  test.setTimeout(10 * 60_000); // 26 full-page scans
  for (const number of [1, 13]) {
    await page.goto(`/payload/${number}`);
    const tabs = await page.locator('[role="tab"]').allTextContents();
    for (const label of tabs) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await scan(page, `payload ${number}, tab "${label}"`);
    }
  }
});
