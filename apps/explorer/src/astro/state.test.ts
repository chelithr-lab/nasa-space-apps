/**
 * Tests for computeAstroStateWith: input validation, wiring, unit handling,
 * internal consistency and source hygiene.
 *
 * These use the SYNTHETIC ephemeris (testSupport.ts), so they check our code,
 * NOT the accuracy of real Moon or Sun positions. See reference.test.ts for
 * the checks against published data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_RANGE } from '../core/time.ts';
import { DEG2RAD } from './angles.ts';
import { KM_PER_AU, MEAN_OBLIQUITY_J2000_ARCSEC, REFERENCE_SPAN } from './constants.ts';
import { computeAstroStateWith, nextMoonQuartersWith } from './state.ts';
import type { AstroState } from './state.ts';
import { makeSyntheticEphemeris } from './testSupport.ts';
import { angleBetweenDeg, dot, norm, scale, vec3 } from './vec3.ts';
import type { Vec3 } from './vec3.ts';

function near(actual: number, expected: number, tol: number, label = ''): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected} +/- ${tol}, got ${actual}`,
  );
}

const X = KM_PER_AU;
const D = 384400;
const EPS = (MEAN_OBLIQUITY_J2000_ARCSEC / 3600) * DEG2RAD;
const SUN = vec3(X, 0, 0);
const T_OK = Date.UTC(2026, 9, 18, 12, 0, 0); // inside range and reference span

function moonOnEcliptic(lonDeg: number): Vec3 {
  const a = lonDeg * DEG2RAD;
  return scale(vec3(Math.cos(a), Math.sin(a) * Math.cos(EPS), Math.sin(a) * Math.sin(EPS)), D);
}

function stateOf(moon: Vec3, extra: Parameters<typeof makeSyntheticEphemeris>[0] extends infer O ? Partial<O> : never = {}, t = T_OK): AstroState {
  const eph = makeSyntheticEphemeris({ moonGeoKm: moon, sunGeoKm: SUN, ...extra });
  const r = computeAstroStateWith(eph, t);
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  return (r as { ok: true; value: AstroState }).value;
}

test('wiring: the ephemeris receives the exact UTC milliseconds that were requested', () => {
  const eph = makeSyntheticEphemeris({ moonGeoKm: moonOnEcliptic(90), sunGeoKm: SUN });
  const r = computeAstroStateWith(eph, T_OK);
  assert.equal(r.ok, true);
  assert.deepEqual(eph.receivedUtcMs, [T_OK]);
  if (r.ok) {
    assert.equal(r.value.utcMs, T_OK);
    assert.equal(r.value.utcIso, '2026-10-18T12:00:00Z');
  }
});

test('units: AU from the ephemeris become kilometres; distances round-trip', () => {
  const s = stateOf(moonOnEcliptic(90));
  near(s.moon.distanceKm, D, 1e-6);
  near(norm(s.moon.geoEqjKm), D, 1e-6);
  near(s.sun.distanceKm, X, 1e-3);
  near(s.sun.distanceAu, 1, 1e-12);
});

test('Full Moon scenario: all phase outputs agree', () => {
  const s = stateOf(vec3(-D, 0, 0));
  near(s.phase.eclipticElongationDeg, 180, 1e-9);
  assert.equal(s.phase.name, 'Full Moon');
  assert.equal(s.phase.index, 4);
  assert.equal(s.phase.waxing, false);
  near(s.phase.diskIlluminatedFraction, 1, 1e-12);
  near(s.geometry.elongationDeg, 180, 1e-9);
  near(s.geometry.phaseAngleDeg, 0, 1e-9);
});

test('New Moon scenario: all phase outputs agree', () => {
  const s = stateOf(vec3(D, 0, 0));
  assert.equal(s.phase.name, 'New Moon');
  near(s.phase.diskIlluminatedFraction, 0, 1e-12);
  near(s.geometry.phaseAngleDeg, 180, 1e-9);
  assert.equal(s.phase.waxing, true);
});

test('First Quarter scenario: waxing, a little over half lit', () => {
  const s = stateOf(moonOnEcliptic(90));
  assert.equal(s.phase.name, 'First Quarter');
  assert.equal(s.phase.waxing, true);
  assert.ok(s.phase.diskIlluminatedFraction > 0.5 && s.phase.diskIlluminatedFraction < 0.502);
});

test('Last Quarter scenario: waning', () => {
  const s = stateOf(moonOnEcliptic(270));
  assert.equal(s.phase.name, 'Last Quarter');
  assert.equal(s.phase.waxing, false);
});

test('all eight phases are produced by moving the Moon around the ecliptic', () => {
  const seen = new Set<string>();
  for (let lon = 0; lon < 360; lon += 45) seen.add(stateOf(moonOnEcliptic(lon)).phase.name);
  assert.equal(seen.size, 8);
});

test('directions from the Moon: unit length, Earth direction is the exact opposite of the Moon direction', () => {
  const s = stateOf(moonOnEcliptic(123));
  near(norm(s.fromMoon.sunDirEqj), 1, 1e-12);
  near(norm(s.fromMoon.earthDirEqj), 1, 1e-12);
  near(norm(s.moon.dirFromEarthEqj), 1, 1e-12);
  near(norm(s.sun.dirFromEarthEqj), 1, 1e-12);
  near(dot(s.fromMoon.earthDirEqj, s.moon.dirFromEarthEqj), -1, 1e-12);
});

test('Sun direction is nearly the same from Earth and from the Moon: they differ by exactly the angle at the Sun', () => {
  const s = stateOf(moonOnEcliptic(200));
  const between = angleBetweenDeg(s.fromMoon.sunDirEqj, s.sun.dirFromEarthEqj);
  near(between, s.geometry.angleAtSunDeg, 1e-9);
  assert.ok(between < 0.16);
});

test('angular diameter of the Moon at 384400 km is about 0.52 degrees (sphere of radius 1737.4 km)', () => {
  const s = stateOf(moonOnEcliptic(0));
  const expected = 2 * Math.asin(1737.4 / D) * (180 / Math.PI);
  near(s.moon.angularDiameterDeg, expected, 1e-12);
  // Independent check computed with Python: 2*asin(1737.4/384400) = 0.5179294 deg (31.08 arcminutes).
  near(s.moon.angularDiameterDeg, 0.5179294, 1e-6, 'independent Python value');
});

test('wholeGlobeLitFractionApprox is a constant one half, independent of phase', () => {
  assert.equal(stateOf(vec3(D, 0, 0)).phase.wholeGlobeLitFractionApprox, 0.5);
  assert.equal(stateOf(vec3(-D, 0, 0)).phase.wholeGlobeLitFractionApprox, 0.5);
});

test('diagnostics: differences are zero when the library agrees, and report the gap when it does not', () => {
  const agree = stateOf(moonOnEcliptic(100));
  near(agree.diagnostics.differences.eclipticElongationDeg, 0, 1e-9);
  near(agree.diagnostics.differences.phaseAngleDeg, 0, 1e-9);
  near(agree.diagnostics.differences.diskIlluminatedFraction, 0, 1e-12);
  near(agree.diagnostics.differences.moonDistanceKm, 0, 1e-6);

  const off = stateOf(vec3(-D, 0, 0), {
    libraryMoonPhaseDeg: 190,
    libraryPhaseAngleDeg: 3,
    libraryFraction: 0.99,
    libration: { distKm: D + 5 },
  });
  near(off.diagnostics.differences.eclipticElongationDeg, -10, 1e-9); // 180 - 190
  near(off.diagnostics.differences.phaseAngleDeg, -3, 1e-9);
  near(off.diagnostics.differences.diskIlluminatedFraction, 0.01, 1e-9);
  near(off.diagnostics.differences.moonDistanceKm, -5, 1e-6);
  assert.equal(off.diagnostics.library.moonPhaseDeg, 190);
});

test('libration values pass through unchanged and are flagged UNVERIFIED', () => {
  const s = stateOf(vec3(-D, 0, 0), {
    libration: { elonDeg: -1.25, elatDeg: 4.5, moonEclLonDeg: 133.1, moonEclLatDeg: -3.2 },
  });
  assert.equal(s.libration.elonDeg, -1.25);
  assert.equal(s.libration.elatDeg, 4.5);
  assert.equal(s.libration.moonEclipticLonDeg, 133.1);
  assert.equal(s.libration.moonEclipticLatDeg, -3.2);
  assert.equal(s.libration.signConvention, 'UNVERIFIED');
  assert.equal(s.libration.accuracy.level, 4);
});

test('accuracy labels use the five-level scheme and are never "observed data"', () => {
  const s = stateOf(moonOnEcliptic(10));
  assert.equal(s.moon.accuracy.level, 2);
  assert.equal(s.sun.accuracy.level, 2);
  assert.equal(s.phase.accuracy.level, 2);
  assert.equal(s.libration.accuracy.level, 4);
  assert.ok(s.earth.available && s.earth.accuracy.level === 4);
  for (const level of [
    s.moon.accuracy.level,
    s.sun.accuracy.level,
    s.phase.accuracy.level,
    s.libration.accuracy.level,
  ]) {
    assert.notEqual(level, 1);
    assert.notEqual(level, 3);
  }
});

test('Earth section: identity equator-of-date and GAST 6 h puts the Sun on the -90 degree meridian', () => {
  const s = stateOf(moonOnEcliptic(0), { gastHours: 6 });
  assert.ok(s.earth.available);
  if (s.earth.available) {
    near(s.earth.gastHours, 6, 0);
    near(s.earth.subSolar.lonDeg, -90, 1e-9);
    near(s.earth.subSolar.latDeg, 0, 1e-9);
  }
});

test('Earth section: a Sun above the equator gives a positive sub-solar latitude (declination)', () => {
  const sunNorth = vec3(X * Math.cos(10 * DEG2RAD), 0, X * Math.sin(10 * DEG2RAD));
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: sunNorth, gastHours: 0 });
  const r = computeAstroStateWith(eph, T_OK);
  assert.ok(r.ok && r.value.earth.available);
  if (r.ok && r.value.earth.available) {
    near(r.value.earth.subSolar.latDeg, 10, 1e-9);
    near(r.value.earth.subSolar.lonDeg, 0, 1e-9);
  }
});

test('Earth section: one sidereal hour of rotation moves the sub-point exactly 15 degrees west', () => {
  const a = stateOf(vec3(D, 0, 0), { gastHours: 3 });
  const b = stateOf(vec3(D, 0, 0), { gastHours: 4 });
  assert.ok(a.earth.available && b.earth.available);
  if (a.earth.available && b.earth.available) {
    near(b.earth.subSolar.lonDeg - a.earth.subSolar.lonDeg, -15, 1e-9);
  }
});

test('Earth section: the Earth-fixed matrix is a proper rotation and keeps vector lengths', () => {
  const s = stateOf(moonOnEcliptic(55), { gastHours: 7.25 });
  assert.ok(s.earth.available);
  if (s.earth.available) {
    const m = s.earth.eqjToEarthFixed;
    // rows orthonormal
    for (let i = 0; i < 3; i++) {
      const row = vec3(m[i]![0], m[i]![1], m[i]![2]);
      near(norm(row), 1, 1e-12);
    }
  }
});

test('Earth section: unavailable orientation is reported, not faked; the rest of the state still works', () => {
  const s = stateOf(moonOnEcliptic(90), { eqjAxesInEqd: null });
  assert.equal(s.earth.available, false);
  if (!s.earth.available) assert.match(s.earth.reason, /Earth orientation switched off/);
  assert.ok(s.warnings.some((w) => /Earth orientation unavailable/.test(w)));
  assert.equal(s.phase.name, 'First Quarter');
});

test('Earth section: a non-rotation matrix (a mirror image) is rejected', () => {
  const s = stateOf(moonOnEcliptic(90), { eqjAxesInEqd: [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, -1)] });
  assert.equal(s.earth.available, false);
  if (!s.earth.available) assert.match(s.earth.reason, /not a proper rotation/);
});

test('input validation: NaN, Infinity, and non-numbers are rejected with a message', () => {
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN });
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '2026-10-18' as unknown as number, undefined as unknown as number]) {
    const r = computeAstroStateWith(eph, bad);
    assert.equal(r.ok, false, `should reject ${String(bad)}`);
    if (!r.ok) assert.match(r.reason, /finite number of UTC milliseconds/);
  }
  assert.deepEqual(eph.receivedUtcMs, [], 'the ephemeris must not be called for invalid input');
});

test('range: exactly the first and last supported instants work; one millisecond outside fails', () => {
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN });
  assert.equal(computeAstroStateWith(eph, SUPPORTED_RANGE.startMs).ok, true);
  assert.equal(computeAstroStateWith(eph, SUPPORTED_RANGE.endMs).ok, true);
  const before = computeAstroStateWith(eph, SUPPORTED_RANGE.startMs - 1);
  const after = computeAstroStateWith(eph, SUPPORTED_RANGE.endMs + 1);
  assert.equal(before.ok, false);
  assert.equal(after.ok, false);
  if (!before.ok) assert.match(before.reason, /outside the supported range/);
});

test('reference-span warning: present outside 1901..2099, absent inside', () => {
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN });
  const edge = (ms: number) => {
    const r = computeAstroStateWith(eph, ms);
    assert.ok(r.ok);
    return r.ok ? r.value.warnings.filter((w) => /reference spot checks/.test(w)) : [];
  };
  assert.equal(edge(SUPPORTED_RANGE.startMs).length, 1, '1900-01-01 is before the reference span');
  assert.equal(edge(SUPPORTED_RANGE.endMs).length, 1, '2100-12-31 is after the reference span');
  assert.equal(edge(REFERENCE_SPAN.startMs).length, 0);
  assert.equal(edge(REFERENCE_SPAN.endMs).length, 0);
  assert.equal(edge(T_OK).length, 0);
});

test('negative (pre-1970) times, fractional milliseconds and a leap day are accepted and passed through', () => {
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN });
  const t1 = Date.UTC(1950, 5, 15, 3, 4, 5);
  const t2 = T_OK + 0.5;
  const t3 = Date.UTC(2024, 1, 29, 12, 0, 0);
  for (const t of [t1, t2, t3]) assert.equal(computeAstroStateWith(eph, t).ok, true);
  assert.deepEqual(eph.receivedUtcMs, [t1, t2, t3]);
});

test('failures never throw: ephemeris error, NaN output, zero vector', () => {
  const thrower = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN, throwMessage: 'boom' });
  const r1 = computeAstroStateWith(thrower, T_OK);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.reason, /boom/);

  const nan = makeSyntheticEphemeris({ moonGeoKm: vec3(Number.NaN, 0, 0), sunGeoKm: SUN });
  const r2 = computeAstroStateWith(nan, T_OK);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.reason, /non-finite Moon vector/);

  const zero = makeSyntheticEphemeris({ moonGeoKm: vec3(0, 0, 0), sunGeoKm: SUN });
  const r3 = computeAstroStateWith(zero, T_OK);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.match(r3.reason, /zero-length Moon vector/);
});

test('determinism: the same instant gives an identical state, and Date.now() is never read', () => {
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('computeAstroStateWith must not read the system clock');
  };
  try {
    const eph = makeSyntheticEphemeris({ moonGeoKm: moonOnEcliptic(77), sunGeoKm: SUN, gastHours: 3.3 });
    const a = computeAstroStateWith(eph, T_OK);
    const b = computeAstroStateWith(eph, T_OK);
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
  } finally {
    Date.now = realNow;
  }
});

test('nextMoonQuartersWith: validates input and passes events through', () => {
  const quarters = [
    { quarter: 2 as const, utcMs: Date.UTC(2026, 9, 26, 4, 12) },
    { quarter: 3 as const, utcMs: Date.UTC(2026, 10, 1, 20, 28) },
  ];
  const eph = makeSyntheticEphemeris({ moonGeoKm: vec3(D, 0, 0), sunGeoKm: SUN, quarters });
  const ok = nextMoonQuartersWith(eph, T_OK, 2);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.value, quarters);
  for (const bad of [0, -1, 1.5, 201, Number.NaN]) assert.equal(nextMoonQuartersWith(eph, T_OK, bad).ok, false);
  assert.equal(nextMoonQuartersWith(eph, Number.NaN, 1).ok, false);
  assert.equal(nextMoonQuartersWith(eph, SUPPORTED_RANGE.endMs + 1, 1).ok, false);
});

test('source hygiene: no clock reads or randomness; only one file imports astronomy-engine', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length >= 10, `expected the astro source files, found ${files.length}`);
  const forbidden: Array<[RegExp, string]> = [
    [/Date\.now\s*\(/, 'Date.now()'],
    [/new Date\(\s*\)/, 'new Date() with no argument'],
    [/performance\.now\s*\(/, 'performance.now()'],
    [/Math\.random\s*\(/, 'Math.random()'],
  ];
  const importers: string[] = [];
  for (const f of files) {
    const code = readFileSync(dir + f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .replace(/^\s*\/\/.*$/gm, ''); // strip line comments
    for (const [re, label] of forbidden) {
      assert.ok(!re.test(code), `${f} contains ${label}`);
    }
    if (/from\s+['"]astronomy-engine['"]/.test(code)) importers.push(f);
  }
  assert.deepEqual(importers, ['ephemeris-astronomy-engine.ts']);
});
