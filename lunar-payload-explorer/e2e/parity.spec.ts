// Visual parity with the prototype (Phase 4). Gated: set PROTO_URL (e.g. http://127.0.0.1:8765/) to run.
// Writes side-by-side screenshots to test-results/parity/ for review; it does not assert pixels.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

const proto = process.env.PROTO_URL;
const out = path.resolve('test-results/parity');

const pairs: Array<{ name: string; width: number; height: number; proto: string; app: string }> = [
  { name: 'home-desktop', width: 1440, height: 900, proto: '#/', app: '/' },
  { name: 'categories-desktop', width: 1440, height: 900, proto: '#/categories', app: '/categories' },
  { name: 'category1-desktop', width: 1440, height: 900, proto: '#/category/1', app: '/category/1' },
  { name: 'search-desktop', width: 1440, height: 900, proto: '#/search?q=spectrometer', app: '/search?q=spectrometer' },
  { name: 'payload1-overview-desktop', width: 1440, height: 1100, proto: '#/payload/1', app: '/payload/1' },
  { name: 'payload13-desktop', width: 1440, height: 1100, proto: '#/payload/13?tab=description', app: '/payload/13?tab=description' },
  { name: 'payload1-specs-desktop', width: 1440, height: 1400, proto: '#/payload/1?tab=specifications', app: '/payload/1?tab=specifications' },
  { name: 'home-mobile', width: 375, height: 812, proto: '#/', app: '/' },
  { name: 'payload1-mobile', width: 375, height: 812, proto: '#/payload/1', app: '/payload/1' },
];

test.skip(!proto, 'set PROTO_URL to the prototype server to run the parity screenshots');

for (const pair of pairs) {
  test(`parity: ${pair.name}`, async ({ browser }) => {
    mkdirSync(out, { recursive: true });
    const context = await browser.newContext({ viewport: { width: pair.width, height: pair.height } });
    const a = await context.newPage();
    await a.goto(proto + pair.proto);
    await a.waitForTimeout(1500);
    await a.screenshot({ path: path.join(out, `${pair.name}.prototype.png`), fullPage: false });
    const b = await context.newPage();
    await b.goto(pair.app);
    await b.waitForTimeout(1500);
    await b.screenshot({ path: path.join(out, `${pair.name}.react.png`), fullPage: false });
    await context.close();
  });
}
