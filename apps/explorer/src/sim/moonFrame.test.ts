import test from 'node:test';
import assert from 'node:assert/strict';
import { eqjToEclJ2000 } from '../astro/frames.ts';
import { normalizeDegSigned180 } from '../astro/angles.ts';
import { cross, dot, isRotationMatrix, norm, normalize, scale, sub, vec3 } from '../astro/vec3.ts';
import { ECLIPTIC_NORTH_EQJ, approximateMoonFrame, directionToLatLon, moonLighting } from './moonFrame.ts';
import { EARTH_MOON_KM, EARTH_SUN_KM, eclipticToEqj } from './testHelpers.ts';

/** Pose the Moon at ecliptic lon/lat and the Sun on the ecliptic at lonSun; return the lighting. */
function pose(moonLon: number, moonLat: number, sunLon: number) {
  const moon = eclipticToEqj(moonLon, moonLat, EARTH_MOON_KM);
  const sun = eclipticToEqj(sunLon, 0, EARTH_SUN_KM);
  const earthDir = normalize(scale(moon, -1));
  const sunDir = normalize(sub(sun, moon));
  const frame = approximateMoonFrame(earthDir);
  assert.ok(frame !== null);
  return { frame: frame!, lighting: moonLighting(frame!, sunDir, earthDir) };
}

test('ecliptic north in EQJ coordinates maps to +z of the ecliptic frame, and sits 23.44 degrees from the celestial pole', () => {
  const e = eqjToEclJ2000(ECLIPTIC_NORTH_EQJ);
  assert.ok(Math.abs(e.x) < 1e-12 && Math.abs(e.y) < 1e-12 && Math.abs(e.z - 1) < 1e-12);
  const angle = (Math.acos(ECLIPTIC_NORTH_EQJ.z) * 180) / Math.PI;
  assert.ok(Math.abs(angle - 23.4393) < 0.001, `angle ${angle}`);
});

test('frame is a proper right-handed rotation with the ecliptic pole as z, for Moon latitudes -5.3..+5.3', () => {
  for (const lat of [-5.3, -2, 0, 3.7, 5.3]) {
    for (const lon of [0, 77, 190, 301]) {
      const earthDir = normalize(scale(eclipticToEqj(lon, lat, EARTH_MOON_KM), -1));
      const f = approximateMoonFrame(earthDir);
      assert.ok(f !== null);
      assert.ok(isRotationMatrix(f!.eqjToMoonFixed, 1e-12));
      assert.ok(dot(f!.zEqj, ECLIPTIC_NORTH_EQJ) > 1 - 1e-15);
      const c = cross(f!.xEqj, f!.yEqj);
      assert.ok(norm(sub(c, f!.zEqj)) < 1e-12, 'x cross y must equal z');
    }
  }
});

test('Earth direction is at longitude 0 by construction and at latitude minus the Moon ecliptic latitude', () => {
  for (const lat of [-5.1, -1.2, 0, 2.5, 5.1]) {
    const { lighting } = pose(123.4, lat, 40);
    assert.ok(Math.abs(lighting.subEarth.lonDeg) < 1e-9, `lon ${lighting.subEarth.lonDeg}`);
    assert.ok(Math.abs(lighting.subEarth.latDeg - -lat) < 1e-9, `lat ${lighting.subEarth.latDeg} for Moon lat ${lat}`);
  }
});

test('phases: sub-solar longitude is 180 at New, +90 at First Quarter, 0 at Full, -90 at Last Quarter', () => {
  // Derived by hand: sub-solar longitude = -(Moon lon - Sun lon) - 180, wrapped.
  // Tolerance 0.35 deg: the Sun direction seen from the Moon differs from the one seen from the
  // Earth by up to 0.16 deg (angle at the Sun), plus a little from the Moon's latitude.
  const sunLon = 215;
  const cases: Array<[string, number, number]> = [
    ['New', 0, 180],
    ['First Quarter', 90, 90],
    ['Full', 180, 0],
    ['Last Quarter', 270, -90],
  ];
  for (const lat of [-5, 0, 4.9]) {
    for (const [name, elong, expected] of cases) {
      const { lighting } = pose(sunLon + elong, lat, sunLon);
      const diff = normalizeDegSigned180(lighting.subSolar.lonDeg - expected);
      assert.ok(Math.abs(diff) < 0.35, `${name} (Moon lat ${lat}): got ${lighting.subSolar.lonDeg}, expected ${expected}`);
    }
  }
});

test('handedness check: at First Quarter the Sun is over the EAST side (y > 0), as on lunar maps with east to the right', () => {
  const { lighting } = pose(100, 0, 10); // elongation 90
  assert.ok(lighting.sunDirMoonFixed.y > 0.99, `y = ${lighting.sunDirMoonFixed.y}`);
  const { lighting: last } = pose(280, 0, 10); // elongation 270
  assert.ok(last.sunDirMoonFixed.y < -0.99);
});

test('sub-solar latitude stays small: the Sun lies near the ecliptic plane, so it never exceeds about 5.5 degrees in this frame', () => {
  // The real maximum is about 1.54 degrees. This approximation differs by dropping the axis tilt
  // and the longitudinal libration; this test documents the bound that holds for THIS model.
  let worst = 0;
  for (let moonLon = 0; moonLon < 360; moonLon += 15) {
    for (const lat of [-5.3, 0, 5.3]) {
      const { lighting } = pose(moonLon, lat, 20);
      worst = Math.max(worst, Math.abs(lighting.subSolar.latDeg));
    }
  }
  assert.ok(worst < 5.5, `worst ${worst}`);
});

test('independent sanity check against the Meeus 1992-04-12 libration (values from the book, via PyMeeus)', () => {
  // Moon ecliptic latitude -3.229126 deg. Meeus optical libration: l = -1.206, b = +4.194 deg.
  // This model gives sub-Earth latitude = -(-3.229) = +3.229 and longitude 0.
  const { lighting } = pose(133.167264, -3.229126, 22);
  assert.ok(Math.abs(lighting.subEarth.latDeg - 3.229126) < 1e-6);
  // Documented error budget of the approximation: axis tilt (up to ~1.54 deg) and longitudinal libration (up to ~8 deg).
  assert.ok(Math.abs(lighting.subEarth.latDeg - 4.194) < 1.6, 'latitude error exceeds the documented tilt bound');
  assert.ok(Math.abs(0 - -1.206) < 8, 'longitude error exceeds the documented libration bound');
});

test('degenerate inputs give null instead of NaN', () => {
  assert.equal(approximateMoonFrame(vec3(0, 0, 0)), null);
  assert.equal(approximateMoonFrame(ECLIPTIC_NORTH_EQJ), null);
  assert.equal(approximateMoonFrame(vec3(Number.NaN, 1, 0)), null);
});

test('directionToLatLon: longitude range is (-180, +180] and poles are +-90', () => {
  assert.equal(directionToLatLon(vec3(-1, 0, 0)).lonDeg, 180);
  assert.equal(directionToLatLon(vec3(-1, -0, 0)).lonDeg, 180);
  assert.ok(Math.abs(directionToLatLon(vec3(0, 0, 1)).latDeg - 90) < 1e-12);
  assert.ok(Math.abs(directionToLatLon(vec3(0, 1, 0)).lonDeg - 90) < 1e-12);
  assert.ok(Math.abs(directionToLatLon(vec3(0, -1, 0)).lonDeg - -90) < 1e-12);
});
