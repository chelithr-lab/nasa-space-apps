// Header name: Bricolage Grotesque SemiBold, 13px, at desktop and phone widths.
import { expect, test } from '@playwright/test';

for (const [name, width] of [['desktop', 1440], ['phone', 375]] as const) {
  test(`header name uses Bricolage Grotesque 600 at 13px (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const name = page.locator('header.app-header .wordmark__name');
    await expect(name).toBeVisible();
    const style = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize };
    });
    expect(style.family).toContain('Bricolage Grotesque');
    expect(style.weight).toBe('600');
    expect(style.size).toBe('13px');
    // The face must actually be available (loaded from Google Fonts), not just named in CSS.
    const loaded = await page.evaluate(async () => (await document.fonts.load('600 13px "Bricolage Grotesque"')).length);
    expect(loaded).toBeGreaterThan(0);
  });
}
