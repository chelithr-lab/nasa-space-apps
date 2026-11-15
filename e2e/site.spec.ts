// Integration checks for the assembled Serenity site: the home page links to each app, each app links back,
// and each app loads under its sub-path. (Per-app behaviour is tested inside each app.)
import { expect, test, type Page } from '@playwright/test';

/** Errors that are not the app's fault: image hosts and fonts reached over the internet, WebGL in headless browsers. */
const ignorable = /Failed to load resource|net::ERR|404|403|WebGL|GPU stall|Fonts|ERR_BLOCKED/;

function collectErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ignorable.test(msg.text())) problems.push(`console: ${msg.text()}`);
  });
  return problems;
}

test('home page: the three explorer buttons become links to the apps', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a.feature-link', { hasText: 'Open Lunar Explorer' })).toHaveAttribute('href', './explorer/');
  await expect(page.locator('a.feature-link', { hasText: 'Open Mission Explorer' })).toHaveAttribute('href', './missions/');
  await expect(page.locator('a.feature-link', { hasText: 'Open Payload Explorer' })).toHaveAttribute('href', './payloads/');
});

test('home → 3D explorer → back to home', async ({ page }) => {
  const problems = collectErrors(page);
  await page.goto('/');
  await page.locator('a.feature-link', { hasText: 'Open Lunar Explorer' }).click();
  await expect(page).toHaveURL(/\/explorer\/$/);
  await expect(page).toHaveTitle('Serenity · 3D Lunar Explorer');
  await expect(page.locator('.sg-brand')).toBeVisible();
  await page.locator('.sg-brand').click();
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});

test('home → mission explorer → back to home', async ({ page }) => {
  const problems = collectErrors(page);
  await page.goto('/');
  await page.locator('a.feature-link', { hasText: 'Open Mission Explorer' }).click();
  await expect(page).toHaveURL(/\/missions\/$/);
  await expect(page.locator('header.top a.brand')).toHaveAttribute('href', '../');
  await page.locator('header.top a.brand').click();
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});

test('home → payload explorer → back to home', async ({ page }) => {
  const problems = collectErrors(page);
  await page.goto('/');
  await page.locator('a.feature-link', { hasText: 'Open Payload Explorer' }).click();
  await expect(page).toHaveURL(/\/payloads\/$/);
  await expect(page).toHaveTitle('Serenity - Payload Explorer');
  await page.locator('a.serenity-link').click();
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});

test('payload app: client-side routes survive a reload under /payloads/', async ({ page }) => {
  await page.goto('/payloads/payload/13?tab=images');
  await expect(page.locator('h1.pd-title')).toHaveText('Fluxgate magnetometer');
  await page.reload();
  await expect(page.locator('h1.pd-title')).toHaveText('Fluxgate magnetometer');
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('Images');
});

test('3D explorer: the Moon texture is served under /explorer/', async ({ request }) => {
  const response = await request.get('/explorer/textures/moon_color_2k.jpg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/jpeg');
});

test('mission explorer: loads its catalogue', async ({ page }) => {
  const problems = collectErrors(page);
  await page.goto('/missions/');
  await expect(page.locator('header.top .brand span')).toHaveText('Serenity - Mission Explorer');
  expect(problems).toEqual([]);
});

test('server: paths outside the site and unsupported methods are refused', async ({ request }) => {
  const traversal = await request.get('/..%2F..%2Fpackage.json');
  expect([403, 404]).toContain(traversal.status());
  const post = await request.post('/');
  expect(post.status()).toBe(405);
});
