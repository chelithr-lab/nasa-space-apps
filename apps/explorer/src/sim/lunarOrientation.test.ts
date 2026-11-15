import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dot, isRotationMatrix, mulMat3Vec3, normalize, vec3 } from '../astro/vec3.ts';
import { ECLIPTIC_NORTH_EQJ, directionToLatLon } from './moonFrame.ts';
import { daysSinceJ2000Tt, eqjToLunarFixed, iauMoonFrame, lunarRotationElements, separationDeg } from './lunarOrientation.ts';
import { sunAltAz, siteFrame } from './solarSite.ts';
import { meeusSunEqj } from './solarTestSupport.ts';
import { toScene } from './sceneMapping.ts';

const DEG = Math.PI / 180;

test('the orientation matrix is a proper rotation at many dates', () => {
  for (let d = -9000; d <= 9000; d += 700) assert.ok(isRotationMatrix(eqjToLunarFixed(d), 1e-12), `d=${d}`);
});

test('the IAU pole direction maps to +Z (north)', () => {
  for (const d of [-5000, 0, 3000, 9500]) {
    const el = lunarRotationElements(d);
    const pole = vec3(
      Math.cos(el.delta0Deg * DEG) * Math.cos(el.alpha0Deg * DEG),
      Math.cos(el.delta0Deg * DEG) * Math.sin(el.alpha0Deg * DEG),
      Math.sin(el.delta0Deg * DEG),
    );
    const f = mulMat3Vec3(eqjToLunarFixed(d), pole);
    assert.ok(Math.abs(f.z - 1) < 1e-12 && Math.abs(f.x) < 1e-12 && Math.abs(f.y) < 1e-12, JSON.stringify(f));
  }
});

test('the prime-meridian node sits at longitude -W (the body turns EASTWARD: W increases with time)', () => {
  const d = 1234.5;
  const el = lunarRotationElements(d);
  const ra = (el.alpha0Deg + 90) * DEG;
  const node = vec3(Math.cos(ra), Math.sin(ra), 0); // on the EQJ equator, 90 deg of RA past the pole's RA
  const f = mulMat3Vec3(eqjToLunarFixed(d), node);
  const lon = directionToLatLon(f).lonDeg;
  const expected = (((-el.wDeg + 180) % 360) + 360) % 360 - 180;
  assert.ok(Math.abs(((lon - expected + 540) % 360) - 180) < 1e-9, `${lon} vs ${expected}`);
});

test('the lunar spin axis is about 1.54 degrees from the ecliptic pole (independent physical fact)', () => {
  for (const d of [-8000, -2000, 0, 4000, 9000]) {
    const m = eqjToLunarFixed(d);
    const zAxis = vec3(m[2][0], m[2][1], m[2][2]);
    const angle = separationDeg(zAxis, ECLIPTIC_NORTH_EQJ);
    assert.ok(Math.abs(angle - 1.54) < 0.12, `d=${d}: ${angle}`);
  }
});

test('the sub-solar LATITUDE never exceeds about 1.55 degrees over several years', () => {
  let max = 0;
  const t0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 4 * 365; i += 3) {
    const t = t0 + i * 86_400_000;
    const f = iauMoonFrame(t, 69);
    const s = mulMat3Vec3(f.eqjToMoonFixed, meeusSunEqj(t).dir);
    max = Math.max(max, Math.abs(directionToLatLon(s).latDeg));
  }
  assert.ok(max > 1.3 && max < 1.65, `max sub-solar latitude ${max}`);
});

test('the sub-solar longitude DECREASES with time (Sun moves west across the sky) at about 12.19 deg/day', () => {
  const t = Date.UTC(2026, 5, 3, 0, 0, 0);
  const lon = (ms: number): number => {
    const f = iauMoonFrame(ms, 69);
    return directionToLatLon(mulMat3Vec3(f.eqjToMoonFixed, meeusSunEqj(ms).dir)).lonDeg;
  };
  const wrap = (x: number): number => ((((x + 180) % 360) + 360) % 360) - 180;
  const d6h = wrap(lon(t + 6 * 3_600_000) - lon(t));
  const d1d = wrap(lon(t + 86_400_000) - lon(t));
  assert.ok(d6h < 0 && Math.abs(d6h + 3.05) < 0.25, `6 h: ${d6h}`);
  assert.ok(Math.abs(d1d + 12.19) < 0.7, `1 day: ${d1d}`);
});

test('Apollo 11: Sun elevation at Tranquility Base at touchdown matches NASA\'s planning figure of 10.8 degrees', () => {
  // NASA SP-4029: the launch window was chosen "to take advantage of a sun elevation angle on the lunar surface of 10.8 degrees";
  // touchdown 20:17:39 UTC, 20 July 1969, at 0.67409 N, 23.47298 E (Apollo Lunar Surface Journal). A planning figure, so a 0.8 deg tolerance.
  const t = Date.UTC(1969, 6, 20, 20, 17, 39);
  const f = iauMoonFrame(t, 40);
  const sun = normalize(mulMat3Vec3(f.eqjToMoonFixed, meeusSunEqj(t).dir));
  const { elevationDeg, azimuthDeg } = sunAltAz(sun, siteFrame(0.67409, 23.47298));
  assert.ok(Math.abs(elevationDeg - 10.8) < 0.8, `elevation ${elevationDeg}`);
  assert.ok(azimuthDeg > 60 && azimuthDeg < 120, `morning Sun must be in the EAST, got azimuth ${azimuthDeg}`);
});

test('mirror check: the Sun\'s +Y (east) component maps to scene -Z, and the morning Sun is east of Apollo 11', () => {
  const east = toScene(vec3(0, 1, 0));
  assert.deepEqual([east.x, east.y, east.z], [0, 0, -1]);
  const t = Date.UTC(1969, 6, 20, 20, 17, 39);
  const f = iauMoonFrame(t, 40);
  const sun = mulMat3Vec3(f.eqjToMoonFixed, meeusSunEqj(t).dir);
  assert.ok(dot(normalize(sun), siteFrame(0.67409, 23.47298).east) > 0.9);
});

test('time scale: days since J2000 TT', () => {
  // J2000.0 is 2000-01-01 12:00:00 TT; with TT-UT = 64 s, UTC 11:58:56 is d = 0
  assert.ok(Math.abs(daysSinceJ2000Tt(Date.UTC(2000, 0, 1, 11, 58, 56), 64)) < 1e-9);
});
