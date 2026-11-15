/**
 * INTEGRATION tests with the REAL astronomy-engine library.
 *
 * If the package is not installed these are SKIPPED (never "passed"). After
 * `npm install astronomy-engine` the summary must show "skipped 0".
 * Each test prints its measured deviations (t.diagnostic).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDegSigned180 } from '../astro/angles.ts';
import { mulMat3Vec3, norm, sub } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { angleBetweenDeg } from '../astro/vec3.ts';
import { earthModelRotation, latLonToUnit, toScene } from './sceneMapping.ts';
import { sampleMoonTrack } from './orbitTrack.ts';
import { buildSnapshot } from './simSnapshot.ts';
import { IAU_MOON_FRAME_MODEL_NAME } from './lunarOrientation.ts';

type Live = typeof import('./liveCompute.ts');
type Astro = typeof import('../astro/index.ts');
let live: Live | null = null;
let astro: Astro | null = null;
let skip: string | false = false;
try {
  live = await import('./liveCompute.ts');
  astro = await import('../astro/index.ts');
} catch (error) {
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ERR_MODULE_NOT_FOUND' && /astronomy-engine/.test(message)) {
    skip = 'astronomy-engine is not installed in this environment: SKIPPED, not passed.';
  } else {
    throw error;
  }
}

function lv(): Live {
  if (live === null) throw new Error('library not loaded');
  return live;
}

function an(): Astro {
  if (astro === null) throw new Error('library not loaded');
  return astro;
}

/** A snapshot with an EXPLICIT Moon-fixed frame model, so each test says which orientation it checks. */
function snapWith(ms: number, model: 'iau' | 'approximate') {
  return buildSnapshot(ms, an().computeAstroState, model);
}

const f = (x: number, d = 4): string => x.toFixed(d);

// ---------------------------------------------------------------------------------------------
// Sub-solar longitude at the exact quarter instants.
//
// WHY THERE ARE TWO VERSIONS. At an exact quarter the Sun-Moon-Earth geometry fixes where the Sun is
// RELATIVE TO THE EARTH as seen from the Moon (new: opposite side, first quarter: +90 deg east, full:
// same side, last quarter: 90 deg west). Whether the sub-solar longitude itself is 180 / +90 / 0 / -90
// depends on where the Earth is in the Moon-fixed frame:
//   - approximate frame: its X axis points at the Earth by construction (zero libration), so the sub-Earth
//     longitude is exactly 0 and the cardinal values hold (test 'approximate frame' below);
//   - IAU frame: the Earth is at the sub-Earth point, which librates by up to about +-8 degrees of
//     longitude, so the cardinal values do NOT hold (they were off by up to ~8 deg); what holds is
//     (sub-solar longitude - sub-Earth longitude) = 180 / +90 / 0 / -90.
// The first version of this test asserted the cardinal values for whatever frame the app used. When the
// app moved to the IAU frame it correctly failed (1950-01-04 07:48:24 UTC, a full Moon, deviation -4.80 deg,
// which is that day's real libration in longitude; see the regression test further down).
//
// TOLERANCE 0.35 deg: what is derived, what is measured.
//   Derived (first-order analysis, NOT a rigorous proof):
//     first / last quarter. Angle at the Earth between Moon and Sun is exactly 90 deg when the ecliptic
//       longitudes differ by 90 deg. The Sun-Moon-Earth angle at the Moon is smaller by the angle at the
//       Sun, at most asin(406,700 km / 147.1e6 km) = 0.158 deg. Spherical trigonometry then gives
//       cos(dLon) = (cos(sep) - sin(lat1)sin(lat2)) / (cos(lat1)cos(lat2)), so the longitude difference
//       also moves by about tan(lat1)tan(lat2) <= tan(6.9 deg) * tan(1.55 deg) = 0.19 deg, where lat1 is
//       the sub-Earth latitude (at most about 6.9 deg) and lat2 the sub-solar latitude (at most 1.55 deg).
//       Sum: about 0.34 deg. 0.35 deg is that sum rounded up: there is almost no spare margin in the
//       worst case, and it is an analytic estimate, not a guaranteed bound.
//     new / full: the Earth and Sun directions are nearly (anti)parallel; the offset is dominated by the
//       0.158 deg angle at the Sun and the tilt (1.54 deg) between the ecliptic and the lunar equator
//       acting on the Moon's ecliptic latitude (up to 5.3 deg): about 0.3 deg at most.
//   Measured (independent Meeus ch. 47 / ch. 25 Moon and Sun, IAU frame, 1,330 exact quarters 1950-2049,
//   in the author's sandbox, NOT with astronomy-engine): worst 0.25 deg at first / last quarter and
//   0.07 deg at new / full. The real library may differ slightly; this test measures it and prints it.
//   Not included in either: the timing error of the library's quarter instants (the sub-solar longitude
//   changes by 0.0085 deg per minute, so a 1-minute error would add that much).
// ---------------------------------------------------------------------------------------------

test('real data (IAU frame): sub-solar longitude minus sub-Earth longitude is 180 / +90 / 0 / -90 degrees at exact quarter instants (tolerance 0.35 deg)', { skip }, (t) => {
  const expectedByQuarter = [180, 90, 0, -90];
  const rows: string[] = [];
  let worst = 0;
  const worstByQuarter = [0, 0, 0, 0];
  for (const start of [Date.UTC(1950, 0, 1), Date.UTC(2026, 0, 1), Date.UTC(2050, 0, 1)]) {
    const q = lv().quartersLive(start, 16);
    assert.ok(q.ok);
    if (!q.ok) return;
    for (const e of q.value) {
      // The app's own snapshot function; its frame model is asserted below so this cannot silently test another one.
      const s = lv().computeSnapshotLive(e.utcMs);
      assert.ok(s.ok);
      if (!s.ok) return;
      assert.equal(s.value.moonFrame.model, IAU_MOON_FRAME_MODEL_NAME, 'the app default must be the IAU frame (no ?frame=approximate in this test)');
      const expected = expectedByQuarter[e.quarter]!;
      const dev = normalizeDegSigned180(s.value.lighting.subSolar.lonDeg - s.value.lighting.subEarth.lonDeg - expected);
      worst = Math.max(worst, Math.abs(dev));
      worstByQuarter[e.quarter] = Math.max(worstByQuarter[e.quarter]!, Math.abs(dev));
      rows.push(`${s.value.astro.utcIso} quarter ${e.quarter}: sub-solar ${f(s.value.lighting.subSolar.lonDeg, 3)}, sub-Earth ${f(s.value.lighting.subEarth.lonDeg, 3)}, deviation of the difference ${f(dev, 4)}`);
      assert.ok(Math.abs(dev) < 0.35, `${s.value.astro.utcIso}: deviation ${f(dev)} deg`);
    }
  }
  t.diagnostic(`worst deviation ${f(worst, 4)} deg over ${rows.length} quarters; worst by quarter [new, first, full, last] = ${worstByQuarter.map((x) => f(x, 3)).join(', ')}\n${rows.slice(0, 8).join('\n')}`);
});

test('real data (approximate frame): the cardinal sub-solar longitudes 180 / +90 / 0 / -90 hold, because that frame has zero libration (tolerance 0.35 deg)', { skip }, (t) => {
  // The ORIGINAL test, kept for the original frame (?frame=approximate). Its tolerance: the Sun seen from the
  // Moon differs from the Sun seen from the Earth by at most about 0.16 deg (angle at the Sun); the rest of
  // the construction is exact at these instants.
  const expectedByQuarter = [180, 90, 0, -90];
  let worst = 0;
  let worstEarthLon = 0;
  for (const start of [Date.UTC(1950, 0, 1), Date.UTC(2026, 0, 1), Date.UTC(2050, 0, 1)]) {
    const q = lv().quartersLive(start, 16);
    assert.ok(q.ok);
    if (!q.ok) return;
    for (const e of q.value) {
      const s = snapWith(e.utcMs, 'approximate');
      assert.ok(s.ok);
      if (!s.ok) return;
      const expected = expectedByQuarter[e.quarter]!;
      const dev = normalizeDegSigned180(s.value.lighting.subSolar.lonDeg - expected);
      worst = Math.max(worst, Math.abs(dev));
      worstEarthLon = Math.max(worstEarthLon, Math.abs(s.value.lighting.subEarth.lonDeg));
      assert.ok(Math.abs(dev) < 0.35, `${s.value.astro.utcIso}: deviation ${f(dev)} deg`);
    }
  }
  t.diagnostic(`worst deviation ${f(worst, 4)} deg; worst |sub-Earth longitude| ${worstEarthLon.toExponential(2)} deg (zero by construction)`);
  assert.ok(worstEarthLon < 1e-6, 'the approximate frame places the Earth at longitude 0 by construction');
});

test('real data (IAU frame): the sub-Earth point librates through a year (not the zero-libration frame)', { skip }, (t) => {
  // Guards against silently falling back to a zero-libration frame. Sampled every 6 h through 2026.
  // Bounds (measured with an independent Meeus Moon, 1950 / 2026 / 2049): longitude within +-7.97 deg
  // (range about 15.5 deg), latitude within +-6.86 deg (range about 13.7 deg). The literature maxima
  // Meeus quotes are about 7.9 deg (optical, longitude) and 6.8 deg (latitude) plus a physical libration
  // under 0.04 deg; those figures are quoted from memory and were not re-read in this session. The upper
  // bounds below (8.3 / 7.1) leave margin; the lower range limits (12 / 10) are well under the measured
  // ranges and far above 0, which is what a zero-libration frame would give.
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 6 * 3_600_000) {
    const s = snapWith(ms, 'iau');
    assert.ok(s.ok);
    if (!s.ok) return;
    const { lonDeg, latDeg } = s.value.lighting.subEarth;
    lonMin = Math.min(lonMin, lonDeg); lonMax = Math.max(lonMax, lonDeg);
    latMin = Math.min(latMin, latDeg); latMax = Math.max(latMax, latDeg);
  }
  t.diagnostic(`2026 sub-Earth longitude ${f(lonMin, 2)}..${f(lonMax, 2)} (range ${f(lonMax - lonMin, 2)}); latitude ${f(latMin, 2)}..${f(latMax, 2)} (range ${f(latMax - latMin, 2)})`);
  assert.ok(Math.max(Math.abs(lonMin), Math.abs(lonMax)) <= 8.3, 'longitude libration exceeds the physical maximum');
  assert.ok(Math.max(Math.abs(latMin), Math.abs(latMax)) <= 7.1, 'latitude libration exceeds the physical maximum');
  assert.ok(lonMax - lonMin >= 12, `longitude libration range ${f(lonMax - lonMin, 2)} deg is too small: is a zero-libration frame in use?`);
  assert.ok(latMax - latMin >= 10, `latitude libration range ${f(latMax - latMin, 2)} deg is too small: is a zero-libration frame in use?`);
});

test('real data (IAU frame): regression at 1950-01-04 07:48:24 UTC (full Moon): sub-Earth longitude -4.80 deg and sub-solar longitude equal to it', { skip }, (t) => {
  // The instant that exposed the outdated cardinal-longitude assumption.
  // INDEPENDENT REFERENCE (not astronomy-engine, not the app): the classical optical libration in longitude,
  // Meeus, Astronomical Algorithms 2nd ed. ch. 53, from a 16-term truncation of the ch. 47 Moon. Computed by
  // the author in a sandbox: l'' = -4.798 deg. The same truncated Moon through the IAU frame gave sub-Earth
  // -4.814 deg (0.016 deg from the classical formula) and sub-solar -4.807 deg; the app (astronomy-engine
  // Moon) gave sub-solar -4.8047 deg when this test first failed (0.003 deg from that independent value).
  // PRECISION: +-0.1 deg. It covers the physical libration (under 0.04 deg, which the optical formula does
  // not include) and the truncated lunar theory (measured agreement 0.016 deg). It is a regression pin on
  // the order of 0.1 deg, not a high-precision validation of the IAU series.
  const ms = Date.UTC(1950, 0, 4, 7, 48, 24);
  const s = lv().computeSnapshotLive(ms);
  assert.ok(s.ok);
  if (!s.ok) return;
  assert.equal(s.value.moonFrame.model, IAU_MOON_FRAME_MODEL_NAME);
  const earthLon = s.value.lighting.subEarth.lonDeg;
  const sunLon = s.value.lighting.subSolar.lonDeg;
  t.diagnostic(`sub-Earth ${f(earthLon, 4)}, sub-solar ${f(sunLon, 4)} (independent reference -4.798 optical libration; -4.807 sub-solar)`);
  assert.ok(Math.abs(earthLon - -4.798) < 0.1, `sub-Earth longitude ${f(earthLon)} deg`);
  assert.ok(Math.abs(sunLon - earthLon) < 0.35, `at a full Moon the Sun is where the Earth is: difference ${f(sunLon - earthLon)} deg`);
  // And it is NOT the old cardinal value: the frame has libration.
  assert.ok(Math.abs(sunLon) > 4, 'a zero-libration frame would give about 0 deg here');
});

test('real data: the angle between Sun and Earth directions in the Moon frame equals the Stage 2 phase angle (a rotation preserves angles)', { skip }, (t) => {
  let worst = 0;
  for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 17 * 3_600_000) {
    const s = lv().computeSnapshotLive(ms);
    assert.ok(s.ok);
    if (!s.ok) return;
    const angle = angleBetweenDeg(s.value.lighting.sunDirMoonFixed, s.value.lighting.earthDirMoonFixed);
    worst = Math.max(worst, Math.abs(angle - s.value.astro.geometry.phaseAngleDeg));
  }
  t.diagnostic(`worst |angle in Moon frame - Stage 2 phase angle| = ${worst.toExponential(2)} deg`);
  assert.ok(worst < 1e-6, `worst ${worst}`);
});

test('real data: the Earth model rotation puts the sub-solar point of the Earth-fixed grid exactly under the Sun direction', { skip }, (t) => {
  let worst = 0;
  for (const ms of [Date.UTC(1950, 5, 15, 3), Date.UTC(2000, 0, 1, 12), Date.UTC(2026, 9, 19, 12), Date.UTC(2026, 11, 21, 20, 50), Date.UTC(2050, 2, 3, 9)]) {
    const s = lv().computeSnapshotLive(ms);
    assert.ok(s.ok);
    if (!s.ok) return;
    const earth = s.value.astro.earth;
    assert.ok(earth.available, 'Earth orientation unavailable');
    if (!earth.available) return;
    const model: Vec3 = toScene(latLonToUnit(earth.subSolar.latDeg, earth.subSolar.lonDeg));
    const placed = mulMat3Vec3(earthModelRotation(earth.eqjToEarthFixed), model);
    const sunScene = toScene(s.value.astro.sun.dirFromEarthEqj);
    worst = Math.max(worst, norm(sub(placed, sunScene)));
  }
  t.diagnostic(`worst vector difference ${worst.toExponential(2)}`);
  assert.ok(worst < 1e-9, `worst ${worst}`);
});

test('real data: the computed Moon path stays between 356,000 and 407,000 km and has no jumps (steps under 60,000 km per half day)', { skip }, (t) => {
  // SANITY bounds: known perigee/apogee extremes are about 356,400 and 406,700 km; the Moon travels at most
  // about 15.4 deg per day, so half a day is at most about 54,000 km of chord.
  let maxStep = 0;
  let minD = Infinity;
  let maxD = 0;
  for (const center of [Date.UTC(1950, 0, 1), Date.UTC(2026, 9, 19), Date.UTC(2050, 6, 1)]) {
    const track = sampleMoonTrack(center, 13.5, 0.5, lv().moonKmLive);
    assert.equal(track.samples.length, 55, 'no sample may be missing inside the validated span');
    for (let i = 0; i < track.samples.length; i++) {
      const d = norm(track.samples[i]!.posKm);
      minD = Math.min(minD, d);
      maxD = Math.max(maxD, d);
      if (i > 0) maxStep = Math.max(maxStep, norm(sub(track.samples[i]!.posKm, track.samples[i - 1]!.posKm)));
    }
  }
  t.diagnostic(`distance range ${f(minD, 0)}..${f(maxD, 0)} km; largest half-day step ${f(maxStep, 0)} km`);
  assert.ok(minD > 356000 && maxD < 407000);
  assert.ok(maxStep < 60000);
});

test('real data: a snapshot and the phase-jump search agree; invalid input fails with a message', { skip }, () => {
  const next = lv().quartersLive(Date.UTC(2026, 9, 19, 12), 1);
  assert.ok(next.ok);
  if (next.ok) {
    assert.equal(next.value[0]?.quarter, 2, 'next phase after 2026-10-19 12:00 UTC is Full Moon (USNO: Oct 26 04:12)');
    assert.ok(Math.abs((next.value[0]?.utcMs ?? 0) - Date.parse('2026-10-26T04:12:00Z')) <= 150_000);
  }
  const bad = lv().computeSnapshotLive(Number.NaN);
  assert.equal(bad.ok, false);
  const far = lv().computeSnapshotLive(Date.UTC(2500, 0, 1));
  assert.equal(far.ok, false);
});
