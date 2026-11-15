import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dot, normalize, scale, vec3 } from '../astro/vec3.ts';
import { makeRaster } from './lunarElevation.ts';
import {
  CONDITION_LABEL, buildSiteModel, computeHorizonProfile, directionFromAltAz, discCoveredFraction, earthCoveredFraction,
  evaluateSite, frameIsOrthonormal, horizonAngleAt, siteFrame, sphereHorizon, sunAltAz,
} from './solarSite.ts';
import type { SiteModel, SunSample } from './solarSite.ts';

const W = 720;
const H = 360; // 0.5 degree cells
/** Raster: counts for 0 m everywhere, then `edit` may raise some cells. */
function flatRaster(edit?: (lonDeg: number, latDeg: number) => number) {
  const counts = new Uint16Array(W * H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const lon = -180 + (c + 0.5) * (360 / W);
      const lat = 90 - (r + 0.5) * (180 / H);
      const metres = edit === undefined ? 0 : edit(lon, lat);
      counts[r * W + c] = Math.round(20000 + metres * 2);
    }
  }
  return makeRaster(W, H, counts);
}

const sample = (dir: ReturnType<typeof vec3>, au = 1): SunSample => ({ utcMs: 0, sunDirFixed: normalize(dir), sunDistanceAu: au, earthVecFixedKm: null });

test('site frames are orthonormal and east x north = up, including at the poles', () => {
  for (const lat of [-90, -89.9, -45, 0, 33, 89.9, 90]) for (const lon of [-180, -90, 0, 77, 180]) {
    assert.ok(frameIsOrthonormal(siteFrame(lat, lon)), `${lat},${lon}`);
  }
});

test('elevation and azimuth: overhead, east horizon, north horizon, west horizon', () => {
  const f = siteFrame(0, 0); // up = +X, east = +Y, north = +Z
  const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(sunAltAz(vec3(1, 0, 0), f).elevationDeg, 90);
  const e = sunAltAz(vec3(0, 1, 0), f); near(e.elevationDeg, 0); near(e.azimuthDeg, 90);
  const n = sunAltAz(vec3(0, 0, 1), f); near(n.azimuthDeg, 0);
  const w = sunAltAz(vec3(0, -1, 0), f); near(w.azimuthDeg, 270);
  const s = sunAltAz(vec3(0, 0, -1), f); near(s.azimuthDeg, 180);
  near(sunAltAz(vec3(-1, 0, 0), f).elevationDeg, -90);
});

test('directionFromAltAz is the inverse of sunAltAz', () => {
  const f = siteFrame(37.5, -112.25);
  for (const [el, az] of [[10, 33], [-20, 250], [60, 359], [0, 180]] as const) {
    const back = sunAltAz(directionFromAltAz(f, el, az), f);
    assert.ok(Math.abs(back.elevationDeg - el) < 1e-9 && Math.abs(((back.azimuthDeg - az + 540) % 360) - 180) < 1e-9);
  }
});

test('flat terrain: the horizon is exactly the sphere (0 degrees) in every direction', () => {
  const p = computeHorizonProfile(flatRaster(), 10, 20);
  assert.equal(p.terrainModelled, true);
  for (let b = 0; b < 360; b += 7) assert.equal(p.anglesDeg[b], 0);
});

test('a 5 km wall 2 degrees east of the site raises the EAST horizon only, by about the geometric angle', () => {
  const raster = flatRaster((lon) => (lon > 2 && lon < 3.5 ? 5000 : 0));
  const p = computeHorizonProfile(raster, 0, 0);
  const east = horizonAngleAt(p, 90);
  // distance ~ 2.0-2.5 deg = 61-76 km, height 5 km, curvature drop 1-1.7 km -> about 2.9 to 3.7 degrees
  assert.ok(east > 2.5 && east < 4.2, `east horizon ${east}`);
  for (const az of [0, 180, 270, 315]) assert.equal(horizonAngleAt(p, az), 0, `az ${az}`);
  // the wall is an unbroken north-south ridge, so a north-east ray meets it too, but lower than due east
  assert.ok(horizonAngleAt(p, 45) > 0 && horizonAngleAt(p, 45) < east);
});

test('curvature hides a 5 km mountain 200 km away: the horizon stays at 0 (drop at 200 km is 11.5 km)', () => {
  const raster = flatRaster((lon) => (lon > 6 && lon < 8 ? 5000 : 0)); // ~182 km east and beyond
  const p = computeHorizonProfile(raster, 0, 0);
  assert.ok(horizonAngleAt(p, 90) < 0.0001, `got ${horizonAngleAt(p, 90)}`);
});

test('terrain classification: Sun below the wall top is TERRAIN SHADOW, above it is lit; Sun below the sphere horizon is DARKNESS', () => {
  const raster = flatRaster((lon) => (lon > 2 && lon < 3.5 ? 5000 : 0));
  const site = buildSiteModel(raster, 0, 0);
  const at = (el: number, az: number) => evaluateSite(site, sample(directionFromAltAz(site.frame, el, az)));
  assert.equal(at(1, 90).condition, 'terrain-shadow');
  assert.equal(at(1, 90).geometricSunUp, true);
  assert.equal(at(1, 90).directSunlight, false);
  assert.equal(at(8, 90).directSunlight, true);
  assert.equal(at(1, 270).directSunlight, true); // west is open
  const night = at(-3, 90);
  assert.equal(night.condition, 'darkness');
  assert.equal(night.terrainBlocked, false); // darkness is NOT a terrain shadow
  assert.notEqual(CONDITION_LABEL['darkness'], CONDITION_LABEL['terrain-shadow']);
});

test('condition bands: high, low, sunrise and sunset use the elevation rate', () => {
  const site = buildSiteModel(null, 0, 0);
  const s = (el: number) => sample(directionFromAltAz(site.frame, el, 90));
  assert.equal(evaluateSite(site, s(45)).condition, 'high-sun');
  assert.equal(evaluateSite(site, s(5)).condition, 'low-sun');
  assert.equal(evaluateSite(site, s(0.1), 0.5).condition, 'sunrise');
  assert.equal(evaluateSite(site, s(0.1), -0.5).condition, 'sunset');
  assert.equal(evaluateSite(site, s(0.1)).condition, 'low-sun'); // no rate known: do not guess
});

test('with no raster the model is a plain sphere and says so', () => {
  const site = buildSiteModel(null, 5, 5);
  assert.equal(site.horizon.terrainModelled, false);
  assert.equal(site.heightM, null);
  assert.equal(site.regionalSlopeDeg, null);
  assert.equal(evaluateSite(site, sample(directionFromAltAz(site.frame, 0.5, 10))).terrainIncidenceDeg, null);
  assert.equal(sphereHorizon().anglesDeg.length, 360);
});

test('regional slope and normal follow a uniform east-rising slope (normal leans WEST)', () => {
  const raster = flatRaster((lon) => lon * 200); // 200 m per degree
  const site = buildSiteModel(raster, 0, 10);
  const rise = 200 / (Math.PI / 180 * 1737400); // m/m
  assert.ok(Math.abs((site.regionalSlopeDeg ?? 0) - Math.atan(rise) * 180 / Math.PI) < 0.02, `slope ${site.regionalSlopeDeg}`);
  assert.ok(dot(site.terrainNormal!, site.frame.east) < 0);
  assert.ok(Math.abs(dot(site.terrainNormal!, site.frame.north)) < 1e-3);
});

test('disc overlap: closed-form cases', () => {
  assert.equal(discCoveredFraction(0, 1, 0.27), 1);
  assert.equal(discCoveredFraction(5, 1, 0.27), 0);
  assert.ok(Math.abs(discCoveredFraction(0, 0.1, 0.27) - (0.1 * 0.1) / (0.27 * 0.27)) < 1e-12); // small disc inside the Sun
  // two equal discs with centres one radius apart overlap by (2 pi/3 - sqrt(3)/2) r^2
  const lens = (2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI;
  assert.ok(Math.abs(discCoveredFraction(1, 1, 1) - lens) < 1e-12);
  const half = discCoveredFraction(1.0, 1, 0.27); // Earth's limb crossing the Sun: partial
  assert.ok(half > 0 && half < 1);
});

test('Earth between the Sun and the site: total, partial and no eclipse', () => {
  const site = buildSiteModel(null, 0, 0); // up = +X
  const mk = (sunDir: ReturnType<typeof vec3>): SunSample => ({ utcMs: 0, sunDirFixed: normalize(sunDir), sunDistanceAu: 1, earthVecFixedKm: vec3(384400, 0, 0) });
  assert.equal(earthCoveredFraction(site, mk(vec3(1, 0, 0))), 1); // Sun directly behind Earth
  assert.equal(earthCoveredFraction(site, mk(vec3(0, 1, 0))), 0); // Sun 90 deg away
  // Earth's angular radius from the Moon is about 0.95 deg; Sun's about 0.27: at 1.0 deg centre separation they overlap partially
  const a = 1.0 * Math.PI / 180;
  const part = earthCoveredFraction(site, mk(vec3(Math.cos(a), Math.sin(a), 0)));
  assert.ok(part > 0 && part < 1, `partial ${part}`);
  // an eclipsed (but otherwise unobstructed) high Sun is classified ECLIPSE and gives no direct light
  const st = evaluateSite(site, mk(vec3(1, 0, 0)));
  assert.equal(st.condition, 'eclipse');
  assert.equal(st.directSunlight, false);
});

test('no Earth vector: no eclipse is invented', () => {
  const site: SiteModel = buildSiteModel(null, 0, 0);
  assert.equal(earthCoveredFraction(site, sample(vec3(1, 0, 0))), 0);
});

test('scale sanity: scaled vector helpers do not change a direction', () => {
  const v = normalize(vec3(1, 2, 3));
  assert.ok(Math.abs(dot(v, normalize(scale(v, 7))) - 1) < 1e-12);
});
