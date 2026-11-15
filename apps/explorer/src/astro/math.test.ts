/**
 * Tests for angles, vectors, matrices and frame maths.
 * Pure maths against hand-calculated answers. No astronomy library involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEG2RAD, normalizeDeg360, normalizeDegSigned180, signedAngleDiffDeg } from './angles.ts';
import { MEAN_OBLIQUITY_J2000_ARCSEC } from './constants.ts';
import { eclipticLonLatDeg, eqjToEclJ2000, geographicLonLatDeg } from './frames.ts';
import {
  angleBetweenDeg,
  cross,
  det3,
  dot,
  isRotationMatrix,
  matFromColumns,
  mulMat3,
  mulMat3Vec3,
  norm,
  normalize,
  rotZCoordinate,
  transpose,
  vec3,
} from './vec3.ts';
import type { Mat3 } from './vec3.ts';

function near(actual: number, expected: number, tol: number, label = ''): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected} +/- ${tol}, got ${actual}`,
  );
}

const EPS_DEG = MEAN_OBLIQUITY_J2000_ARCSEC / 3600;

test('normalizeDeg360 wraps into [0, 360)', () => {
  assert.equal(normalizeDeg360(0), 0);
  assert.equal(normalizeDeg360(360), 0);
  assert.equal(normalizeDeg360(725), 5);
  assert.equal(normalizeDeg360(-90), 270);
  assert.equal(normalizeDeg360(-360), 0);
  const tiny = normalizeDeg360(-1e-17);
  assert.ok(tiny >= 0 && tiny < 360, `tiny negative must stay below 360, got ${tiny}`);
  assert.ok(Number.isNaN(normalizeDeg360(Number.NaN)));
});

test('normalizeDegSigned180 wraps into (-180, +180]', () => {
  assert.equal(normalizeDegSigned180(180), 180);
  assert.equal(normalizeDegSigned180(-180), 180);
  assert.equal(normalizeDegSigned180(181), -179);
  assert.equal(normalizeDegSigned180(359), -1);
  assert.equal(normalizeDegSigned180(-181), 179);
});

test('signedAngleDiffDeg takes the short way round', () => {
  assert.equal(signedAngleDiffDeg(10, 350), 20);
  assert.equal(signedAngleDiffDeg(350, 10), -20);
  assert.equal(signedAngleDiffDeg(5, 5), 0);
});

test('vector basics: dot, cross, norm, normalize', () => {
  const x = vec3(1, 0, 0);
  const y = vec3(0, 1, 0);
  assert.equal(dot(x, y), 0);
  assert.deepEqual(cross(x, y), vec3(0, 0, 1));
  assert.equal(norm(vec3(3, 4, 12)), 13);
  near(norm(normalize(vec3(3, 4, 12))), 1, 1e-15);
  assert.throws(() => normalize(vec3(0, 0, 0)), RangeError);
  assert.throws(() => normalize(vec3(Number.NaN, 0, 0)), RangeError);
});

test('angleBetweenDeg: 0, 90, 180 and a very small angle', () => {
  const x = vec3(1, 0, 0);
  near(angleBetweenDeg(x, vec3(5, 0, 0)), 0, 1e-12);
  near(angleBetweenDeg(x, vec3(0, 7, 0)), 90, 1e-12);
  near(angleBetweenDeg(x, vec3(-2, 0, 0)), 180, 1e-12);
  // 1e-9 radians: acos(dot) would return exactly 0 here, atan2 must not.
  const small = angleBetweenDeg(x, vec3(Math.cos(1e-9), Math.sin(1e-9), 0));
  near(small, (1e-9 * 180) / Math.PI, 1e-14, 'small angle');
});

test('rotZCoordinate(90) maps the x axis to -y (coordinates of a fixed vector)', () => {
  const r = mulMat3Vec3(rotZCoordinate(90), vec3(1, 0, 0));
  near(r.x, 0, 1e-15);
  near(r.y, -1, 1e-15);
  near(r.z, 0, 1e-15);
});

test('matrices: product with identity, transpose, determinant, rotation check', () => {
  const identity: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const r = rotZCoordinate(37);
  assert.deepEqual(mulMat3(identity, r), r);
  assert.deepEqual(mulMat3(r, identity), r);
  near(det3(r), 1, 1e-15);
  assert.ok(isRotationMatrix(r));
  // Rotation times its transpose is the identity.
  const prod = mulMat3(r, transpose(r));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) near(prod[i]![j]!, i === j ? 1 : 0, 1e-15);
  }
  // A mirror (determinant -1) and a scaled matrix are NOT proper rotations.
  const mirror: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ];
  assert.equal(isRotationMatrix(mirror), false);
  const scaled: Mat3 = [
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 2],
  ];
  assert.equal(isRotationMatrix(scaled), false);
});

test('matFromColumns puts the vectors in the columns', () => {
  const m = matFromColumns(vec3(1, 2, 3), vec3(4, 5, 6), vec3(7, 8, 9));
  assert.deepEqual(m, [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
  ]);
  assert.deepEqual(mulMat3Vec3(m, vec3(1, 0, 0)), vec3(1, 2, 3));
});

test('EQJ -> ecliptic: x axis unchanged, ecliptic plane vector has latitude 0', () => {
  const ex = eclipticLonLatDeg(eqjToEclJ2000(vec3(1, 0, 0)));
  near(ex.lonDeg, 0, 1e-12);
  near(ex.latDeg, 0, 1e-12);
  const e = EPS_DEG * DEG2RAD;
  // A point 90 degrees along the ecliptic from the equinox.
  const p = eclipticLonLatDeg(eqjToEclJ2000(vec3(0, Math.cos(e), Math.sin(e))));
  near(p.lonDeg, 90, 1e-9, 'longitude');
  near(p.latDeg, 0, 1e-9, 'latitude');
});

test('EQJ -> ecliptic: the north celestial pole sits (90 - obliquity) from the ecliptic', () => {
  const pole = eclipticLonLatDeg(eqjToEclJ2000(vec3(0, 0, 1)));
  near(pole.lonDeg, 90, 1e-9, 'longitude');
  near(pole.latDeg, 90 - EPS_DEG, 1e-9, 'latitude');
  near(90 - EPS_DEG, 66.5607, 1e-3, 'sanity: 66.56 degrees is the known ecliptic latitude of the pole');
});

test('geographicLonLatDeg: cardinal directions and range', () => {
  const g = (x: number, y: number, z: number) => geographicLonLatDeg(vec3(x, y, z));
  assert.equal(g(1, 0, 0).lonDeg, 0);
  assert.equal(g(0, 1, 0).lonDeg, 90);
  assert.equal(g(-1, 0, 0).lonDeg, 180); // never -180
  assert.equal(g(0, -1, 0).lonDeg, -90);
  assert.equal(g(0, 0, 1).latDeg, 90);
  assert.equal(g(0, 0, -1).latDeg, -90);
  near(g(1, 0, 1).latDeg, 45, 1e-12);
});

test('Earth-fixed chain: the equinox direction lies 90 degrees WEST when sidereal time is 6 h', () => {
  // Hour angle of the equinox at Greenwich = GAST. At GAST = 6 h = 90 deg the
  // equinox is 90 degrees west of Greenwich, i.e. longitude -90.
  const efFromEqd = rotZCoordinate(6 * 15);
  const p = geographicLonLatDeg(mulMat3Vec3(efFromEqd, vec3(1, 0, 0)));
  near(p.lonDeg, -90, 1e-12);
  near(p.latDeg, 0, 1e-12);
  // And at GAST = 0 the equinox is exactly on the Greenwich meridian.
  const p0 = geographicLonLatDeg(mulMat3Vec3(rotZCoordinate(0), vec3(1, 0, 0)));
  near(p0.lonDeg, 0, 1e-12);
});
