// Payload page: tabs, article sections, images, lightbox, layout (ported from tools/verify-e2e.mjs).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

interface CatalogueFile {
  payloads: { number: number; detail_file: string | null }[];
}
const catalogue = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'public/data/catalogue.json'), 'utf8'),
) as CatalogueFile;
const noArticle = catalogue.payloads.find((p) => !p.detail_file)?.number ?? null;

const activeTab = (page: import('@playwright/test').Page) => page.locator('[role="tab"][aria-selected="true"]');
const visiblePanel = (page: import('@playwright/test').Page) => page.locator('[role="tabpanel"]:not([hidden])');

test.describe('payload #1', () => {
  test('AC4: 13 tabs, no extra Overview-images tab, title', async ({ page }) => {
    await page.goto('/payload/1');
    await expect(page.locator('[role="tab"]')).toHaveCount(13);
    await expect(page.locator('[role="tab"]', { hasText: /images/i })).toHaveCount(1); // only "Images"
    await expect(page).toHaveTitle('Passive Seismometer · Serenity - Payload Explorer');
  });

  test('FR-D12: Overview shows its three images; feature image is the full-resolution file', async ({ page }) => {
    await page.goto('/payload/1');
    await expect(visiblePanel(page).locator('.section-images .gallery__item')).toHaveCount(3);
    await expect(page.locator('.pd-figure__btn img')).toHaveAttribute('src', /371255main_Seismic_full\.jpg$/);
  });

  test('FR-D12: a section image opens the lightbox scoped to that section', async ({ page }) => {
    await page.goto('/payload/1');
    await visiblePanel(page).locator('.section-images .gallery__item').first().click();
    await expect(page.locator('dialog.lightbox .lightbox__bar .label')).toHaveText('Image 1 of 3');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.lightbox')).toHaveJSProperty('open', false);
  });

  test('AC6 tabs: ArrowRight moves selection, focus and URL; End goes to the last tab', async ({ page }) => {
    await page.goto('/payload/1');
    await activeTab(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(activeTab(page)).toHaveText('Description');
    await expect(activeTab(page)).toBeFocused();
    await expect(page).toHaveURL(/\/payload\/1\?tab=description$/);
    await page.keyboard.press('End');
    await expect(activeTab(page)).toHaveText('References');
  });

  test('AC4: the 8 references open in a new tab with safe rel attributes', async ({ page }) => {
    await page.goto('/payload/1?tab=references');
    const links = page.locator('.refs a');
    await expect(links).toHaveCount(8);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('AC6: ?tab=specifications survives reload; spec values are formatted', async ({ page }) => {
    await page.goto('/payload/1?tab=specifications');
    await page.reload();
    await expect(activeTab(page)).toHaveText('Physical Specifications');
    const rows = await page.locator('.spec-card .spec-table tr').evaluateAll((trs) =>
      trs.map((tr) => `${tr.querySelector('th')?.textContent}=${tr.querySelector('td')?.textContent}`),
    );
    expect(rows).toEqual(expect.arrayContaining([
      'Mass=11.5 kg',
      'Short-period sensor response range=0.05–20 Hz',
      'Power consumption=≈ 4.3–7.4 W',
      'External dimensions=40 × 40 × 40 cm',
    ]));
    await expect(page.locator('.spec-card')).toHaveCount(2);
    await expect(page.locator('.spec-card .gallery--mini .gallery__item')).toHaveCount(6);
    expect(rows.some((r) => r.startsWith('Images='))).toBe(false);
  });

  test('AC4: transport tab shows six numbered steps and its two images', async ({ page }) => {
    await page.goto('/payload/1?tab=transportation');
    await expect(activeTab(page)).toHaveText('Transportation & Deployment');
    await expect(page.locator('.stepper__step')).toHaveCount(6);
    await expect(visiblePanel(page).locator('.section-images .gallery__item')).toHaveCount(2);
    await expect(visiblePanel(page).locator('.subpanel')).toHaveCount(0);
  });

  test('FR-D7: Images tab lists 7 images; the Smithsonian HTML page shows "Preview unavailable"', async ({ page }) => {
    await page.goto('/payload/1?tab=images');
    await expect(visiblePanel(page).locator('.gallery--gallery .gallery__item')).toHaveCount(7);
    await expect(visiblePanel(page).locator('.img-unavailable')).toHaveCount(1);
    // Thumbnails that load: 6 (network-dependent; allow for slow hosts).
    await expect
      .poll(() => visiblePanel(page).locator('.gallery__img img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length), { timeout: 20_000 })
      .toBe(6);
  });

  test('AC4 + FR-D7: lightbox opens, moves with arrows keeping focus inside, and closes with Escape', async ({ page }) => {
    await page.goto('/payload/1?tab=images');
    await visiblePanel(page).locator('.gallery--gallery .gallery__item').first().click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog).toHaveAttribute('open', '');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.lightbox__bar .label')).toHaveText('Image 2 of 7');
    // Focus stays inside the dialog while navigating (it was lost in an earlier build).
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveJSProperty('open', false);
  });

  test('FR-D1 + layout: no side column; the details module uses the full content width', async ({ page }) => {
    await page.goto('/payload/13');
    await expect(page.locator('.pd aside')).toHaveCount(0);
    await expect(page.getByText('Content status', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Quick facts', { exact: true })).toHaveCount(0);
    const head = await page.locator('.pd-head').boundingBox();
    const tabs = await page.locator('.pd .tabs').boundingBox();
    expect(Math.abs((head?.width ?? 0) - (tabs?.width ?? 0))).toBeLessThanOrEqual(2);
  });

  test('article text spans the full panel width', async ({ page }) => {
    await page.goto('/payload/13');
    await page.getByRole('tab', { name: 'Description' }).click();
    const panel = await visiblePanel(page).boundingBox();
    const prose = await visiblePanel(page).locator('.prose').first().boundingBox();
    expect(prose?.width ?? 0).toBeGreaterThanOrEqual((panel?.width ?? 0) * 0.95);
  });

  test('unknown ?tab falls back to Overview', async ({ page }) => {
    await page.goto('/payload/1?tab=bogus');
    await expect(activeTab(page)).toHaveText('Overview');
    await expect(page).toHaveURL(/\/payload\/1$/);
  });

  test('Back after a tab change leaves the payload page (tabs replace history)', async ({ page }) => {
    await page.goto('/category/3');
    await page.goto('/payload/54');
    await page.getByRole('tab', { name: 'Description' }).click();
    await page.getByRole('tab', { name: 'Operating Principle' }).click();
    await page.goBack();
    await expect(page).toHaveURL(/\/category\/3$/);
  });

  test('old prototype link /#/payload/13?tab=images still works', async ({ page }) => {
    await page.goto('/#/payload/13?tab=images');
    await expect(page).toHaveURL(/\/payload\/13\?tab=images$/);
    await expect(activeTab(page)).toHaveText('Images');
  });
});

test('FR-G5: unknown payload number shows Not found', async ({ page }) => {
  await page.goto('/payload/999');
  await expect(page.locator('h1')).toContainText('couldn’t find');
});

test('AC5: a payload without an article shows "coming soon", not an error', async ({ page }) => {
  test.skip(noArticle === null, 'every payload has an article');
  await page.goto(`/payload/${noArticle}`);
  await expect(page.locator('.state--soon')).toBeVisible();
  await expect(page.locator('.state--error')).toHaveCount(0);
  await expect(page.locator('.pd-nav a').first()).toBeVisible();
});
