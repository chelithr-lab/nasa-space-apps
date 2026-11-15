import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HYPOTHESES,
  angularDistanceDeg,
  appearsAt,
  checkOrientation,
  craterContrastMetres,
  destination,
  findExtrema,
  withDefect,
  wrapLonDeg,
} from './orientationCheck.ts';
import type { Hypothesis } from './orientationCheck.ts';
import { CRATER_LANDMARKS, EXTREMUM_LANDMARKS, ORIENTATION_LIMITS } from './orientationLandmarks.ts';
import { columnCentreLonDeg, makeRaster, rowCentreLatDeg } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';

const W = 1440; // 4 pixels per degree: small enough to test quickly
const H = 720;

/** Deterministic pseudo-noise in [-1, 1]. */
function noise(i: number): number {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

/** A synthetic Moon: gentle noise, the named craters, distractor craters, and one tall peak and one deep pit. */
function syntheticMoon(): ElevationRaster {
  const heights = new Float32Array(W * H);
  const bowls: Array<{ lat: number; lon: number; dKm: number; depth: number }> = [
    ...CRATER_LANDMARKS.map((c) => ({ lat: c.latDeg, lon: c.lonDeg, dKm: c.diameterKm, depth: 3500 })),
    // distractors, none of them at a mirror/flip/shift image of a landmark
    { lat: 32, lon: 61, dKm: 110, depth: 3000 },
    { lat: -12, lon: -98, dKm: 140, depth: 3200 },
    { lat: 58, lon: -33, dKm: 95, depth: 2800 },
    { lat: -35, lon: 160, dKm: 120, depth: 3100 },
  ];
  const peak = EXTREMUM_LANDMARKS.find((e) => e.id === 'highest');
  const pit = EXTREMUM_LANDMARKS.find((e) => e.id === 'lowest');
  assert.ok(peak && pit);
  const raster0 = makeRaster(W, H, new Uint16Array(W * H));
  for (let r = 0; r < H; r++) {
    const lat = rowCentreLatDeg(raster0, r);
    for (let c = 0; c < W; c++) {
      const lon = columnCentreLonDeg(raster0, c);
      let h = noise(r * W + c) * 40;
      for (const b of bowls) {
        const d = angularDistanceDeg({ latDeg: lat, lonDeg: lon }, { latDeg: b.lat, lonDeg: b.lon }) * (Math.PI / 180) * 1737.4;
        const R = b.dKm / 2;
        if (d < R) h -= b.depth * (1 - (d / R) * (d / R));
        h += 0.35 * b.depth * Math.exp(-(((d - R) / (0.15 * R)) ** 2));
      }
      const dp = angularDistanceDeg({ latDeg: lat, lonDeg: lon }, { latDeg: peak.latDeg, lonDeg: peak.lonDeg }) * (Math.PI / 180) * 1737.4;
      h += 10_600 * Math.exp(-((dp / 35) ** 2));
      const dl = angularDistanceDeg({ latDeg: lat, lonDeg: lon }, { latDeg: pit.latDeg, lonDeg: pit.lonDeg }) * (Math.PI / 180) * 1737.4;
      h -= 8_900 * Math.exp(-((dl / 35) ** 2));
      heights[r * W + c] = h;
    }
  }
  const counts = new Uint16Array(W * H);
  for (let i = 0; i < counts.length; i++) counts[i] = Math.round(20000 + 2 * (heights[i] ?? 0));
  return makeRaster(W, H, counts);
}

const TRUTH = syntheticMoon();

test('helpers: wrapLonDeg, great-circle distance and destination agree with each other', () => {
  assert.equal(wrapLonDeg(190), -170);
  assert.equal(wrapLonDeg(-190), 170);
  assert.equal(wrapLonDeg(180), 180);
  assert.equal(wrapLonDeg(-180), 180);
  assert.ok(Math.abs(angularDistanceDeg({ latDeg: 0, lonDeg: 0 }, { latDeg: 0, lonDeg: 90 }) - 90) < 1e-9);
  assert.ok(Math.abs(angularDistanceDeg({ latDeg: 90, lonDeg: 0 }, { latDeg: -90, lonDeg: 33 }) - 180) < 1e-9);
  const p = { latDeg: 40, lonDeg: 170 };
  for (const bearing of [0, 1, 2, 3, 4, 5]) {
    const q = destination(p, bearing, 0.1);
    assert.ok(Math.abs(angularDistanceDeg(p, q) - 0.1 / (Math.PI / 180)) < 1e-6);
  }
  const across = destination({ latDeg: 0, lonDeg: 179 }, Math.PI / 2, 2 * (Math.PI / 180));
  assert.ok(Math.abs(across.lonDeg - -179) < 1e-6, 'crossing the seam gives -179');
});

test('each defect moves a known point exactly as documented', () => {
  const p = { latDeg: 20, lonDeg: 30 };
  assert.deepEqual(appearsAt('identity', p), p);
  assert.deepEqual(appearsAt('eastWestMirror', p), { latDeg: 20, lonDeg: -30 });
  assert.deepEqual(appearsAt('northSouthFlip', p), { latDeg: -20, lonDeg: 30 });
  assert.deepEqual(appearsAt('shift180', p), { latDeg: 20, lonDeg: -150 });
  assert.deepEqual(appearsAt('mirrorAndFlip', p), { latDeg: -20, lonDeg: -30 });
});

test('withDefect really moves the data: the pit that sits at the lowest landmark appears where appearsAt says', () => {
  const lowest = EXTREMUM_LANDMARKS.find((e) => e.id === 'lowest');
  assert.ok(lowest);
  for (const h of HYPOTHESES) {
    const defective = withDefect(TRUTH, h);
    const found = findExtrema(defective).lowest;
    const expected = appearsAt(h, lowest);
    assert.ok(angularDistanceDeg(found, expected) < 1, `${h}: lowest pixel at ${found.latDeg},${found.lonDeg}; expected near ${expected.latDeg},${expected.lonDeg}`);
  }
  assert.deepEqual(withDefect(withDefect(TRUTH, 'eastWestMirror'), 'eastWestMirror').counts, TRUTH.counts, 'a mirror applied twice is the identity');
});

test('crater contrast is strong at the true crater and weak a few degrees away', () => {
  const tsi = CRATER_LANDMARKS.find((c) => c.id === 'tsiolkovskiy');
  assert.ok(tsi);
  const at = craterContrastMetres(TRUTH, tsi, tsi.diameterKm);
  const off = craterContrastMetres(TRUTH, { latDeg: tsi.latDeg + 8, lonDeg: tsi.lonDeg + 8 }, tsi.diameterKm);
  assert.ok(at > 800, `contrast at crater ${at}`);
  assert.ok(Math.abs(off) < 300, `contrast off crater ${off}`);
});

test('a correct raster is reported as consistent with the code, with both kinds of evidence agreeing', () => {
  const report = checkOrientation(TRUTH);
  assert.equal(report.verdict, 'consistent-with-code', JSON.stringify({ e: report.extrema.misfitDeg, c: report.craters.totalZ }));
  assert.equal(report.extrema.supportsIdentity, true);
  assert.equal(report.craters.supportsIdentity, true);
  assert.equal(report.suspectedDefect, null);
  assert.equal(report.colourTexture, 'unresolved');
  assert.match(report.statement, /not proof/);
  assert.match(report.statement, /colour texture/);
  assert.ok(report.limits.length === ORIENTATION_LIMITS.length && report.limits.length >= 5);
});

for (const defect of HYPOTHESES.filter((h) => h !== 'identity')) {
  test(`detects ${defect}: the report contradicts the code and names the defect`, () => {
    const report = checkOrientation(withDefect(TRUTH, defect as Hypothesis));
    assert.equal(report.verdict, 'contradicts-code', JSON.stringify({ e: report.extrema.misfitDeg, c: report.craters.totalZ }));
    assert.equal(report.suspectedDefect, defect);
    assert.equal(report.extrema.best, defect);
    assert.equal(report.craters.best, defect);
  });
}

test('a raster of pure noise is inconclusive, never "consistent"', () => {
  const counts = new Uint16Array(W * H);
  for (let i = 0; i < counts.length; i++) counts[i] = Math.round(20000 + noise(i + 99) * 2000);
  const report = checkOrientation(makeRaster(W, H, counts));
  assert.notEqual(report.verdict, 'consistent-with-code');
});

test('correct extremes but no craters is inconclusive: extrema alone are not accepted as proof', () => {
  const counts = new Uint16Array(TRUTH.counts);
  // Flatten every landmark crater (and distractors) but keep the two extremes.
  const flat = syntheticMoon();
  const lowest = EXTREMUM_LANDMARKS.find((e) => e.id === 'lowest');
  const highest = EXTREMUM_LANDMARKS.find((e) => e.id === 'highest');
  assert.ok(lowest && highest);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const p = { latDeg: rowCentreLatDeg(flat, r), lonDeg: columnCentreLonDeg(flat, c) };
    const near = angularDistanceDeg(p, lowest) < 4 || angularDistanceDeg(p, highest) < 4;
    if (!near) counts[r * W + c] = Math.round(20000 + noise(r * W + c) * 40);
  }
  const report = checkOrientation(makeRaster(W, H, counts));
  assert.equal(report.extrema.supportsIdentity, true);
  assert.equal(report.verdict, 'inconclusive');
});

test('landmark records state their evidence tier and source; nothing is unlabelled', () => {
  for (const l of [...CRATER_LANDMARKS, ...EXTREMUM_LANDMARKS]) {
    assert.ok(l.tier === 'gazetteer' || l.tier === 'secondary');
    assert.match(l.source, /^https:\/\//);
    assert.ok(l.note.length > 20);
    assert.ok(Math.abs(l.latDeg) <= 90 && l.lonDeg >= -180 && l.lonDeg <= 180);
  }
  assert.equal(CRATER_LANDMARKS.find((c) => c.id === 'tsiolkovskiy')?.tier, 'gazetteer');
  // Honest labelling: the two that could not be confirmed on the Gazetteer say so.
  assert.equal(CRATER_LANDMARKS.find((c) => c.id === 'tycho')?.tier, 'secondary');
  assert.equal(CRATER_LANDMARKS.find((c) => c.id === 'copernicus')?.tier, 'secondary');
  assert.ok(ORIENTATION_LIMITS.some((t) => /colour texture/.test(t)));
  assert.ok(ORIENTATION_LIMITS.some((t) => /synthetic rasters only/.test(t)));
});
