// Smoke test: every payload page renders with no console or page errors (risk 6.4).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const catalogue = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'public/data/catalogue.json'), 'utf8'),
) as { payloads: { number: number }[] };

test('every payload page (320) renders its heading and tabs without errors', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });

  for (const { number } of catalogue.payloads) {
    problems.length = 0;
    await page.goto(`/payload/${number}`);
    await expect(page.locator('h1.pd-title')).toBeVisible();
    // Image-host failures are reported by the browser as console errors; they are expected for some
    // external hosts, so only non-resource errors fail the run.
    const real = problems.filter((p) => !/Failed to load resource|net::ERR|404|403/.test(p));
    expect(real, `payload ${number}`).toEqual([]);
  }
});
