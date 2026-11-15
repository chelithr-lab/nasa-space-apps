/**
 * Tests for the Earth-Moon-Sun triangle, elongation and phase naming.
 * Synthetic vectors with hand-derived answers. No astronomy library involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEG2RAD } from './angles.ts';
import { KM_PER_AU, MEAN_OBLIQUITY_J2000_ARCSEC } from './constants.ts';
import {
  PHASE_NAMES,
  diskIlluminatedFractionFromPhaseAngleDeg,
  eclipticElongationDeg,
  isWaxing,
  phaseIndexFromEclipticElongation,
  phaseNameFromEclipticElongation,
  triangleGeometry,
} from './geometry.ts';
import { scale, vec3 } from './vec3.ts';

function near(actual: number, expected: number, tol: number, label = ''): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected} +/- ${tol}, got ${actual}`,
  );
}

const X = KM_PER_AU; // Sun distance along +x (km)
const D = 384400; // a typical Earth-Moon distance (km)
const EPS = (MEAN_OBLIQUITY_J2000_ARCSEC / 3600) * DEG2RAD;
const SUN = vec3(X, 0, 0);

/** A Moon exactly `lonDeg` degrees east of the Sun along the ecliptic (latitude 0). */
function moonOnEcliptic(lonDeg: number) {
  const a = lonDeg * DEG2RAD;
  // ecliptic unit vector (cos a, sin a, 0) rotated into EQJ
  return scale(vec3(Math.cos(a), Math.sin(a) * Math.cos(EPS), Math.sin(a) * Math.sin(EPS)), D);
}

test('illuminated fraction formula at 0, 90, 180 degrees', () => {
  near(diskIlluminatedFractionFromPhaseAngleDeg(0), 1, 1e-15);
  near(diskIlluminatedFractionFromPhaseAngleDeg(90), 0.5, 1e-15);
  near(diskIlluminatedFractionFromPhaseAngleDeg(180), 0, 1e-15);
});

test('New Moon: Moon between Earth and Sun', () => {
  const t = triangleGeometry(vec3(D, 0, 0), SUN);
  near(t.elongationDeg, 0, 1e-9);
  near(t.phaseAngleDeg, 180, 1e-9);
  near(t.diskIlluminatedFraction, 0, 1e-12);
  near(t.earthMoonKm, D, 1e-6);
  near(t.moonSunKm, X - D, 1e-3);
});

test('Full Moon: Earth between Moon and Sun', () => {
  const t = triangleGeometry(vec3(-D, 0, 0), SUN);
  near(t.elongationDeg, 180, 1e-9);
  near(t.phaseAngleDeg, 0, 1e-9);
  near(t.diskIlluminatedFraction, 1, 1e-12);
});

test('Quadrature: phase angle is slightly LESS than 90 degrees (Moon a little more than half lit)', () => {
  const t = triangleGeometry(moonOnEcliptic(90), SUN);
  near(t.elongationDeg, 90, 1e-9);
  // Derived by hand: cos(i) = D / sqrt(X^2 + D^2)  =>  i = atan(X / D)
  const expectedPhaseAngle = Math.atan2(X, D) * (180 / Math.PI);
  near(t.phaseAngleDeg, expectedPhaseAngle, 1e-9, 'phase angle');
  assert.ok(t.phaseAngleDeg < 90 && t.phaseAngleDeg > 89.8, `got ${t.phaseAngleDeg}`);
  const expectedFraction = (1 + D / Math.hypot(X, D)) / 2;
  near(t.diskIlluminatedFraction, expectedFraction, 1e-12, 'fraction');
  assert.ok(t.diskIlluminatedFraction > 0.5 && t.diskIlluminatedFraction < 0.502);
});

test('triangle angles sum to exactly 180 degrees for many Moon positions', () => {
  let worst = 0;
  for (let lon = 0; lon < 360; lon += 7.5) {
    const t = triangleGeometry(moonOnEcliptic(lon), SUN);
    worst = Math.max(worst, Math.abs(t.elongationDeg + t.phaseAngleDeg + t.angleAtSunDeg - 180));
  }
  assert.ok(worst < 1e-7, `worst deviation ${worst} degrees`);
});

test('angle at the Sun is tiny (about D / X radians, under 0.15 degrees)', () => {
  const t = triangleGeometry(moonOnEcliptic(90), SUN);
  const approx = (D / X) * (180 / Math.PI);
  near(t.angleAtSunDeg, approx, 1e-4);
  assert.ok(t.angleAtSunDeg < 0.16);
});

test('ecliptic elongation reproduces the requested ecliptic longitude difference', () => {
  for (const lon of [0, 30, 90, 135, 180, 225, 270, 359]) {
    near(eclipticElongationDeg(moonOnEcliptic(lon), SUN), lon, 1e-9, `lon ${lon}`);
  }
});

test('ecliptic elongation measures the difference in longitude, whatever the Sun longitude', () => {
  // Sun at ecliptic longitude 40, Moon at 130: elongation 90.
  const sunAt = (lonDeg: number) => {
    const a = lonDeg * DEG2RAD;
    return scale(vec3(Math.cos(a), Math.sin(a) * Math.cos(EPS), Math.sin(a) * Math.sin(EPS)), X);
  };
  const moonAt = (lonDeg: number) => {
    const a = lonDeg * DEG2RAD;
    return scale(vec3(Math.cos(a), Math.sin(a) * Math.cos(EPS), Math.sin(a) * Math.sin(EPS)), D);
  };
  near(eclipticElongationDeg(moonAt(130), sunAt(40)), 90, 1e-9);
  // Wrap-around: Sun at 350, Moon at 20 -> 30 east of the Sun.
  near(eclipticElongationDeg(moonAt(20), sunAt(350)), 30, 1e-9);
  // Moon west of the Sun: Sun at 20, Moon at 350 -> 330.
  near(eclipticElongationDeg(moonAt(350), sunAt(20)), 330, 1e-9);
});

test('phase names: each of the 8 sector centres maps to the right name', () => {
  const expected: Array<[number, string]> = [
    [0, 'New Moon'],
    [45, 'Waxing Crescent'],
    [90, 'First Quarter'],
    [135, 'Waxing Gibbous'],
    [180, 'Full Moon'],
    [225, 'Waning Gibbous'],
    [270, 'Last Quarter'],
    [315, 'Waning Crescent'],
  ];
  for (const [deg, name] of expected) {
    assert.equal(phaseNameFromEclipticElongation(deg), name, `at ${deg}`);
  }
  assert.equal(PHASE_NAMES.length, 8);
});

test('phase names: sector edges include the lower edge and exclude the upper edge', () => {
  assert.equal(phaseNameFromEclipticElongation(22.4999), 'New Moon');
  assert.equal(phaseNameFromEclipticElongation(22.5), 'Waxing Crescent');
  assert.equal(phaseNameFromEclipticElongation(67.5), 'First Quarter');
  assert.equal(phaseNameFromEclipticElongation(112.5), 'Waxing Gibbous');
  assert.equal(phaseNameFromEclipticElongation(157.5), 'Full Moon');
  assert.equal(phaseNameFromEclipticElongation(202.5), 'Waning Gibbous');
  assert.equal(phaseNameFromEclipticElongation(247.5), 'Last Quarter');
  assert.equal(phaseNameFromEclipticElongation(292.5), 'Waning Crescent');
  assert.equal(phaseNameFromEclipticElongation(337.5), 'New Moon');
  assert.equal(phaseNameFromEclipticElongation(359.999), 'New Moon');
});

test('phase names: negative and over-range inputs wrap; index stays 0..7 for a full sweep', () => {
  assert.equal(phaseNameFromEclipticElongation(-45), 'Waning Crescent');
  assert.equal(phaseNameFromEclipticElongation(405), 'Waxing Crescent');
  for (let d = -720; d <= 720; d += 0.25) {
    const i = phaseIndexFromEclipticElongation(d);
    assert.ok(Number.isInteger(i) && i >= 0 && i <= 7, `index ${i} at ${d}`);
  }
});

test('waxing flag: true for 0..180 (180 excluded), false otherwise', () => {
  assert.equal(isWaxing(0), true);
  assert.equal(isWaxing(90), true);
  assert.equal(isWaxing(179.999), true);
  assert.equal(isWaxing(180), false);
  assert.equal(isWaxing(270), false);
  assert.equal(isWaxing(359.9), false);
});

test('phase angle and elongation agree: phase angle ~ 180 - elongation (within the Sun-angle)', () => {
  for (let lon = 0; lon < 360; lon += 15) {
    const t = triangleGeometry(moonOnEcliptic(lon), SUN);
    near(t.phaseAngleDeg, 180 - t.elongationDeg - t.angleAtSunDeg, 1e-7, `lon ${lon}`);
  }
});
