import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_STEP_METRES,
  DEFAULT_ELEVATION_SETTINGS,
  bakeRgba,
  buildColourLut,
  computeElevationStats,
  describeScale,
  displayRange,
  formatKm,
  legendGradientCss,
  legendPosition,
  legendTicks,
  oklabToSrgb,
  paletteColour,
  resampleMeanCounts,
  srgbToOklab,
} from './elevationColour.ts';
import type { DisplayRange, ElevationSettings } from './elevationColour.ts';
import { countAt, makeRaster } from './lunarElevation.ts';
import { buildLatLonSphere } from './sphereMesh.ts';

const rgbOf = (lut: Uint32Array, count: number): number[] => {
  const b = new Uint8Array(lut.buffer, lut.byteOffset, lut.byteLength);
  return [b[count * 4] ?? -1, b[count * 4 + 1] ?? -1, b[count * 4 + 2] ?? -1, b[count * 4 + 3] ?? -1];
};
const near = (a: readonly number[], b: readonly number[], tol = 2): boolean => a.every((v, i) => Math.abs(v - (b[i] ?? 1e9)) <= tol);

test('Oklab conversion round-trips every sRGB grey and a spread of colours', () => {
  for (const c of [[0, 0, 0], [255, 255, 255], [128, 128, 128], [200, 30, 90], [12, 240, 120], [68, 1, 84]] as const) {
    assert.ok(near(oklabToSrgb(srgbToOklab(c)), c, 1), `round trip ${c.join(',')}`);
  }
});

test('palettes: end colours and stop colours are exactly the documented ones', () => {
  assert.ok(near(paletteColour('viridis', 0), [0x44, 0x01, 0x54], 1));
  assert.ok(near(paletteColour('viridis', 1), [0xfd, 0xe7, 0x25], 1));
  assert.ok(near(paletteColour('viridis', 8 / 16), [0x21, 0x91, 0x8c], 1));
  assert.ok(near(paletteColour('hypsometric', 0), [0x1a, 0x0b, 0x3d], 1));
  assert.ok(near(paletteColour('hypsometric', 1), [255, 255, 255], 1));
  assert.ok(near(paletteColour('hypsometric', 0.52), [0x3c, 0xc4, 0x7a], 1));
  assert.deepEqual(paletteColour('viridis', -5), paletteColour('viridis', 0), 'out of range clamps');
  assert.deepEqual(paletteColour('viridis', NaN), paletteColour('viridis', 0));
});

test('viridis is perceptually ordered: Oklab lightness rises at every one of 200 steps (the hypsometric ramp is not claimed to)', () => {
  let prev = -1;
  for (let i = 0; i <= 200; i++) {
    const L = srgbToOklab(paletteColour('viridis', i / 200))[0];
    assert.ok(L >= prev - 1e-6, `lightness dropped at step ${i}`);
    prev = L;
  }
});

test('colour table: 0 m sits at the stated fraction of the range; ends and clipping use the end colours; alpha is opaque', () => {
  const range: DisplayRange = { loMetres: -1000, hiMetres: 1000, clipsData: true };
  const lut = buildColourLut({ ...DEFAULT_ELEVATION_SETTINGS, palette: 'viridis' }, range);
  assert.ok(near(rgbOf(lut, 20_000).slice(0, 3), paletteColour('viridis', 0.5), 1), '0 m is the middle colour');
  assert.ok(near(rgbOf(lut, 20_000 - 2000).slice(0, 3), paletteColour('viridis', 0), 1), '-1000 m is the first colour');
  assert.deepEqual(rgbOf(lut, 0).slice(0, 3), rgbOf(lut, 20_000 - 2000).slice(0, 3), 'far below the range is clipped to the first colour');
  assert.deepEqual(rgbOf(lut, 65535).slice(0, 3), rgbOf(lut, 20_000 + 2000).slice(0, 3), 'far above is clipped to the last colour');
  for (const c of [0, 20_000, 65535]) assert.equal(rgbOf(lut, c)[3], 255);
});

test('colour is a strictly one-to-one function of height inside the range (no repeated colour for different heights, smooth mode)', () => {
  const range: DisplayRange = { loMetres: -4000, hiMetres: 5000, clipsData: true };
  const lut = buildColourLut({ ...DEFAULT_ELEVATION_SETTINGS, palette: 'viridis' }, range);
  const seen = new Map<string, number>();
  let collisions = 0;
  for (let h = -4000; h <= 5000; h += 50) {
    const key = rgbOf(lut, 20_000 + h * 2).slice(0, 3).join(',');
    const prev = seen.get(key);
    if (prev !== undefined && Math.abs(prev - h) > 100) collisions++;
    seen.set(key, h);
  }
  assert.equal(collisions, 0);
});

test('1 km banding: every height inside a band has one colour, adjacent bands differ, and band edges are on whole kilometres', () => {
  const range: DisplayRange = { loMetres: -4000, hiMetres: 4000, clipsData: true };
  const lut = buildColourLut({ ...DEFAULT_ELEVATION_SETTINGS, palette: 'viridis', banding: '1000' }, range);
  const colourAt = (h: number): string => rgbOf(lut, 20_000 + h * 2).slice(0, 3).join(',');
  assert.equal(BAND_STEP_METRES['1000'], 1000);
  assert.equal(colourAt(1100), colourAt(1900));
  assert.equal(colourAt(1000), colourAt(1999));
  assert.notEqual(colourAt(999), colourAt(1000));
  assert.notEqual(colourAt(1999), colourAt(2000));
});

test('statistics are area-weighted: an equatorial row counts far more than a polar row', () => {
  // 16 x 8: the two polar rows are 0 m (count 20000), everything else is +1000 m (22000).
  const w = 16;
  const h = 8;
  const counts = new Uint16Array(w * h).fill(22_000);
  for (let c = 0; c < w; c++) { counts[c] = 20_000; counts[(h - 1) * w + c] = 20_000; }
  const stats = computeElevationStats(makeRaster(w, h, counts), 4);
  assert.equal(stats.minMetres, 0);
  assert.equal(stats.maxMetres, 1000);
  const weights = Array.from({ length: h }, (_, r) => Math.sin(((90 - (r * 180) / h) * Math.PI) / 180) - Math.sin(((90 - ((r + 1) * 180) / h) * Math.PI) / 180));
  const polar = (weights[0] ?? 0) + (weights[h - 1] ?? 0);
  const expectedLowFraction = polar / weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs((stats.histogram[0] ?? 0) - expectedLowFraction) < 1e-9, `lowest bin ${stats.histogram[0]} vs ${expectedLowFraction}`);
  assert.ok(expectedLowFraction < 0.13, 'polar rows hold about 1/8 of the rows but far less of the area');
  assert.ok(Math.abs(stats.histogram.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'histogram sums to 1');
  assert.equal(stats.p02Metres, 0, 'the polar rows hold about 10% of the area, so the 2nd percentile is in the low band');
  assert.equal(stats.p98Metres, 1000);
});

test('display range: rounds OUTWARD to 100 m, reports clipping honestly, never inverts', () => {
  const stats = { minMetres: -8981.5, maxMetres: 10685.5, p02Metres: -3412, p98Metres: 3877, histogram: [1] };
  const full = displayRange(stats, 'full');
  assert.deepEqual([full.loMetres, full.hiMetres, full.clipsData], [-9000, 10700, false]);
  const contrast = displayRange(stats, 'contrast');
  assert.deepEqual([contrast.loMetres, contrast.hiMetres, contrast.clipsData], [-3500, 3900, true]);
  const degenerate = displayRange({ ...stats, minMetres: 5, maxMetres: 5, p02Metres: 5, p98Metres: 5 }, 'full');
  assert.ok(degenerate.hiMetres > degenerate.loMetres);
});

test('legend: round tick values inside the range, true minus signs, one decimal at most, clipped markers pinned to the ends', () => {
  const r: DisplayRange = { loMetres: -3500, hiMetres: 3900, clipsData: true };
  const ticks = legendTicks(r);
  assert.ok(ticks.length >= 3 && ticks.length <= 5);
  assert.ok(ticks.every((t) => t >= r.loMetres && t <= r.hiMetres));
  assert.ok(ticks.includes(0));
  assert.equal(formatKm(-2500), '−2.5 km');
  assert.equal(formatKm(4000), '+4 km');
  assert.equal(formatKm(0), '0 km');
  assert.equal(formatKm(-30), '0 km', 'rounding to 0.1 km never prints a signed zero');
  assert.deepEqual(legendPosition(-3500, r), { fraction: 0, clipped: null });
  assert.equal(legendPosition(-6000, r).clipped, 'below');
  assert.equal(legendPosition(-6000, r).fraction, 0);
  assert.equal(legendPosition(9000, r).clipped, 'above');
  assert.equal(legendPosition(9000, r).fraction, 1);
  const full = legendTicks({ loMetres: -9000, hiMetres: 10700, clipsData: false });
  assert.ok(full.length <= 5 && full.includes(0));
});

test('legend gradient uses the same lookup as the texture: its first and last colours equal the table at the range ends', () => {
  const r: DisplayRange = { loMetres: -2000, hiMetres: 3000, clipsData: true };
  const settings: ElevationSettings = { ...DEFAULT_ELEVATION_SETTINGS, palette: 'viridis' };
  const css = legendGradientCss(settings, r);
  const lut = buildColourLut(settings, r);
  const first = rgbOf(lut, 20_000 + r.loMetres * 2);
  const last = rgbOf(lut, 20_000 + r.hiMetres * 2);
  assert.ok(css.startsWith(`linear-gradient(to right, rgb(${first[0]},${first[1]},${first[2]}) 0.00%`));
  assert.ok(css.endsWith(`rgb(${last[0]},${last[1]},${last[2]}) 100.00%)`));
});

test('resampling preserves mean height: constant stays constant, 2:1 is the exact mean, a fractional ratio keeps the overall mean', () => {
  const flat = makeRaster(16, 8, new Uint16Array(128).fill(23_456));
  assert.ok(resampleMeanCounts(flat, 10, 5).every((v) => v === 23_456));
  const counts = Uint16Array.from({ length: 8 * 4 }, (_, i) => 20_000 + i * 10);
  const half = resampleMeanCounts(makeRaster(8, 4, counts), 4, 2);
  const expect = (r: number, c: number): number => {
    const v = (rr: number, cc: number): number => counts[rr * 8 + cc] ?? 0;
    return Math.round((v(2 * r, 2 * c) + v(2 * r, 2 * c + 1) + v(2 * r + 1, 2 * c) + v(2 * r + 1, 2 * c + 1)) / 4);
  };
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) assert.equal(half[r * 4 + c], expect(r, c));
  const big = makeRaster(46, 22, Uint16Array.from({ length: 46 * 22 }, (_, i) => 20_000 + ((i * 7919) % 3000)));
  const small = resampleMeanCounts(big, 32, 16);
  const mean = (a: ArrayLike<number>): number => Array.from(a).reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(small) - mean(big.counts)) < 25, `mean ${mean(small)} vs ${mean(big.counts)}`);
  assert.equal(small.length, 32 * 16);
});

test('ORIENTATION: the baked texture, read at the mesh UV of a latitude/longitude, holds the colour of the raster pixel at that latitude/longitude', () => {
  const w = 96;
  const h = 48;
  const counts = Uint16Array.from({ length: w * h }, (_, i) => 20_000 + (i % 7919) * 3);
  const raster = makeRaster(w, h, counts);
  const lut = buildColourLut({ ...DEFAULT_ELEVATION_SETTINGS, palette: 'viridis' }, { loMetres: -2000, hiMetres: 22_000, clipsData: false });
  const mean = resampleMeanCounts(raster, w, h); // same size: identity
  const rgba = new Uint8Array(w * h * 4);
  bakeRgba(mean, w, h, lut, rgba);
  const px = new Uint32Array(rgba.buffer);
  // The mesh rule (checked against buildLatLonSphere below): u = (lon + 180) / 360, v = (lat + 90) / 180.
  let checked = 0;
  for (let lat = -87.3; lat < 90; lat += 7.77) {
    for (let lon = -178.9; lon < 180; lon += 9.31) {
      const u = (lon + 180) / 360;
      const v = (lat + 90) / 180;
      const texCol = Math.min(w - 1, Math.floor(u * w));
      const texRow = Math.min(h - 1, Math.floor(v * h)); // texture row 0 = v 0 = south
      const rasterCol = Math.floor(((lon + 180) / 360) * w);
      const rasterRow = Math.floor(((90 - lat) / 180) * h); // raster row 0 = north
      assert.equal(px[texRow * w + texCol], lut[countAt(raster, rasterCol, rasterRow)], `lat ${lat} lon ${lon}`);
      checked++;
    }
  }
  assert.ok(checked > 200);
  // And the mesh really uses that rule.
  const sphere = buildLatLonSphere(1, 24, 12);
  for (let r = 0; r <= 12; r++) for (let c = 0; c <= 24; c++) {
    const i = r * 25 + c;
    assert.ok(Math.abs((sphere.uvs[i * 2] ?? -1) - c / 24) < 1e-6);
    assert.ok(Math.abs((sphere.uvs[i * 2 + 1] ?? -1) - (1 - r / 12)) < 1e-6);
  }
});

test('baking checks its buffers, and the scale description states datum, limits, clipping and that boundaries are not geology', () => {
  assert.throws(() => bakeRgba(new Uint16Array(4), 2, 2, new Uint32Array(65536), new Uint8Array(3)), RangeError);
  const stats = { minMetres: -8981.5, maxMetres: 10685.5, p02Metres: -3412, p98Metres: 3877, histogram: [1] };
  const text = describeScale(DEFAULT_ELEVATION_SETTINGS, displayRange(stats, 'contrast'), stats);
  assert.match(text, /1737\.4 km reference sphere \(not sea level\)/);
  assert.match(text, /clipped/);
  assert.match(text, /−9 km/);
  assert.match(text, /not geological units/);
  assert.match(describeScale(DEFAULT_ELEVATION_SETTINGS, displayRange(stats, 'full'), stats), /Nothing is clipped/);
});
