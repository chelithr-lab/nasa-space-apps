// Browse flow: home, categories, category pages, typeahead and search results (ported from tools/verify-e2e.mjs).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface CatalogueFile {
  counts: { with_details: number };
  categories: { number: number; payload_numbers: number[] }[];
  payloads: { number: number; category: number; detail_file: string | null }[];
}
const catalogue = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'public/data/catalogue.json'), 'utf8'),
) as CatalogueFile;
const withArticles = catalogue.counts.with_details;
const cat1WithArticles = catalogue.payloads.filter((p) => p.category === 1 && p.detail_file).length;

async function typeahead(page: Page, text: string): Promise<string[]> {
  const input = page.locator('header.app-header input[type="search"]');
  await input.fill(text);
  // Debounce is 150 ms; wait for the list to reflect the new query.
  await page.waitForTimeout(350);
  return page.locator('header.app-header [role="option"]').evaluateAll((opts) =>
    opts.map((o) => {
      const name = o.querySelector('.search__opt-name')?.textContent ?? '';
      const num = o.querySelector('.search__opt-num')?.textContent ?? '';
      const cat = o.querySelector('.search__opt-cat')?.textContent ?? '';
      return `${name} ${num} [${cat}]`;
    }),
  );
}

test('AC1 home: 16 category tiles and the stats strip', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home a.tile')).toHaveCount(16);
  const stats = await page.locator('.stat__n').allTextContents();
  expect(stats).toEqual(['16', '320', String(withArticles)]);
  await expect(page.locator('.hero__moon img, .hero__moon--css').first()).toBeAttached();
});

test('AC2 every category page lists its payloads as cards; counts sum to 320', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  let total = 0;
  for (const category of catalogue.categories) {
    await page.goto(`/category/${category.number}`);
    await expect(page.locator('.cat-head h1')).toBeVisible();
    const cards = page.locator('.grid--cards article.card');
    // Wait for the expected number of cards, then check each one.
    await expect(cards).toHaveCount(category.payload_numbers.length);
    total += category.payload_numbers.length;
    for (const card of await cards.all()) {
      await expect(card.locator('.card__title')).toBeVisible();
      await expect(card.locator('a.card__cta')).toHaveAttribute('href', /^\/payload\/\d+$/);
    }
  }
  expect(total).toBe(320);
});

test('FR-L3 in-category filter and "With articles" toggle', async ({ page }) => {
  await page.goto('/category/1');
  await page.locator('.filter input').fill('period');
  await expect(page.locator('.grid--cards article.card')).toHaveCount(2);
  await page.locator('.filter input').fill('');
  // The radio is visually hidden; its label is what a visitor clicks.
  await page.locator('label', { hasText: 'With articles' }).click();
  await expect(page.locator('.grid--cards article.card')).toHaveCount(cat1WithArticles);
});

test('AC3 typeahead results for the acceptance queries', async ({ page }) => {
  await page.goto('/');
  let opts = await typeahead(page, 'seismo');
  expect(opts).toHaveLength(4);
  expect(opts.every((o) => /seismometer/i.test(o))).toBe(true);

  opts = await typeahead(page, 'apxs');
  expect(opts).toHaveLength(1);
  expect(opts[0]).toContain('#054');

  opts = await typeahead(page, 'mossbauer');
  expect(opts).toHaveLength(1);
  expect(opts[0]).toContain('#064');

  opts = await typeahead(page, 'gas chromatograph');
  expect(opts.some((o) => o.includes('#070') && o.includes('Mineralogical'))).toBe(true);
  expect(opts.some((o) => o.includes('#144') && o.includes('exosphere'))).toBe(true);
});

test('AC6 typeahead keyboard: arrows set the active option, Escape closes, Enter opens', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('header.app-header input[type="search"]');
  await input.fill('seismo');
  await page.waitForTimeout(350);
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /-o1$/);
  await input.press('Escape');
  await expect(page.locator('header.app-header [role="listbox"]')).toBeHidden();

  await input.clear(); // same text would not fire an input event
  await input.fill('seismo');
  await page.waitForTimeout(350);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/payload\/1$/);
});

test('FR-S4 Enter without a selection goes to the results page with the query in the URL', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('header.app-header input[type="search"]');
  await input.fill('gas chromatograph');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=gas(\+|%20)chromatograph$/);
});

test('FR-S4 results page groups by category and highlights matches', async ({ page }) => {
  await page.goto('/search?q=spectrometer');
  await expect(page.locator('.result-group .grid--cards article.card')).toHaveCount(27);
  await expect(page.locator('.result-group__head')).toHaveCount(5);
  expect(await page.locator('.result-group mark').count()).toBeGreaterThan(0);
});

test('FR-S6 empty results show the empty state', async ({ page }) => {
  await page.goto('/search?q=xyzzy');
  await expect(page.locator('.state__title')).toContainText('xyzzy');
});

test('FR-G5 unknown category number shows Not found', async ({ page }) => {
  await page.goto('/category/99');
  await expect(page.locator('h1')).toContainText('couldn’t find');
});
