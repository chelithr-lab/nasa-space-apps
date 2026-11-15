/**
 * Scientific tests of the terrain-visibility engine on SYNTHETIC terrain whose correct answers are known
 * analytically. Reference values are computed here by independent formulas (not by the engine's code path).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toScene, latLonToUnit } from './sceneMapping.ts';
import { exaggerationFromSearch } from './terrainConfig.ts';
import { decodeHeightMetres, heightToSceneRadius, makeRaster } from './lunarElevation.ts';
import { computeHorizonProfile, directionFromAltAz, horizonAngleAt, siteFrame, sunAltAz } from './solarSite.ts';
import {
  REFERENCE_RADIUS_KM as R,
  KM_PER_DEGREE,
  functionHeightField,
  geoToMoonFixedKm,
  moonFixedKmToGeo,
  rasterHeightField,
} from './heightField.ts';
import type { HeightField } from './heightField.ts';
import { VisibilityCache, discFractionAbove, sunAngularRadiusDeg, terrainVisibility } from './terrainVisibility.ts';
import type { Vec3 } from '../astro/vec3.ts';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Sun direction for a site: elevation above its tangent plane and azimuth clockwise from north. */
const sunAt = (lat: number, lon: number, el: number, az: number): Vec3 => directionFromAltAz(siteFrame(lat, lon), el, az);

/** Elevation angle (degrees) at which a terrain point `heightKm` above the sphere, `arcDeg` of arc away, is seen from a point `observerKm` above it. */
function elevationOfPoint(observerKm: number, heightKm: number, arcDeg: number): number {
  const t = arcDeg * RAD;
  return Math.atan2((R + heightKm) * Math.cos(t) - (R + observerKm), (R + heightKm) * Math.sin(t)) * DEG;
}

const flat = (heightM = 0): HeightField => functionHeightField({ id: 'flat', effectiveSpacingKm: 1, maxHeightM: heightM, minHeightM: heightM, fn: () => heightM });

/** A wall (ridge) running north-south, `heightM` high, between two longitudes, spanning +-halfLenDeg of latitude. */
function wall(lonFrom: number, lonTo: number, heightM: number, spacingKm = 0.1, halfLenDeg = 2): HeightField {
  return functionHeightField({
    id: `wall-${lonFrom}-${lonTo}-${heightM}`,
    effectiveSpacingKm: spacingKm,
    maxHeightM: heightM,
    minHeightM: 0,
    fn: (lat, lon) => (lon >= lonFrom && lon <= lonTo && Math.abs(lat) <= halfLenDeg ? heightM : 0),
  });
}

test('coordinate transformations keep the established conventions (lon 0 = +X, east = +Y astronomy = -Z scene, north = +Z / +Y scene)', () => {
  const p0 = geoToMoonFixedKm(0, 0, 0);
  assert.ok(Math.abs(p0.x - R) < 1e-9 && Math.abs(p0.y) < 1e-9 && Math.abs(p0.z) < 1e-9);
  const east = geoToMoonFixedKm(0, 90, 0);
  assert.ok(east.y > R - 1e-9, 'east is +Y in the astronomy frame');
  assert.ok(toScene(latLonToUnit(0, 90)).z < -0.999, 'and -Z in the scene');
  assert.ok(toScene(latLonToUnit(90, 0)).y > 0.999, 'north is +Y in the scene');
  for (const [lat, lon, h] of [[10, 20, 1500], [-45, -170, -3000], [89.9, 33, 0], [0, 180, 200]] as const) {
    const back = moonFixedKmToGeo(geoToMoonFixedKm(lat, lon, h));
    assert.ok(Math.abs(back.latDeg - lat) < 1e-9 && Math.abs(back.heightM - h) < 1e-6);
    const dLon = ((back.lonDeg - lon + 540) % 360) - 180;
    assert.ok(Math.abs(dLon) < 1e-9);
  }
  assert.equal(moonFixedKmToGeo(geoToMoonFixedKm(-90, 0, 100)).lonDeg, 0, 'longitude at a pole is defined as 0, not NaN');
});

test('flat terrain: a Sun above the horizon is not obstructed; one below it is geometric darkness (not a terrain shadow)', () => {
  for (const [lat, lon] of [[0, 0], [40, -75], [-88, 12], [89.9, 100]] as const) {
    for (const az of [0, 90, 200, 301]) {
      for (const el of [0.05, 1, 10, 60, 89]) {
        const r = terrainVisibility(flat(), { latDeg: lat, lonDeg: lon }, sunAt(lat, lon, el, az));
        assert.equal(r.status, 'direct-sunlight', `lat ${lat} az ${az} el ${el}: ${r.reason}`);
        assert.equal(r.firstBlockedKm, null);
      }
      const dark = terrainVisibility(flat(), { latDeg: lat, lonDeg: lon }, sunAt(lat, lon, -0.5, az));
      assert.equal(dark.status, 'geometric-darkness');
    }
  }
});

test('ridge between the site and the Sun blocks it exactly when the Sun is below the ridge top (analytic angle, curvature included)', () => {
  // Ridge 2 km high, 17 to 17.6 km east of an equatorial site. Its near face is seen at an elevation computed independently.
  const lonFrom = 17 / KM_PER_DEGREE;
  const field = wall(lonFrom, lonFrom + 0.6 / KM_PER_DEGREE, 2000);
  const alpha = elevationOfPoint(0, 2, lonFrom);
  assert.ok(alpha > 6 && alpha < 7, `sanity: ${alpha}`);
  const below = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, alpha - 0.1, 90));
  const above = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, alpha + 0.1, 90));
  assert.equal(below.status, 'terrain-obstruction');
  assert.equal(above.status, 'direct-sunlight');
  assert.ok(below.firstBlockedKm !== null && Math.abs(below.firstBlockedKm - 17) < 0.2, `entry distance ${below.firstBlockedKm}`);
  assert.ok(below.limitingFeature !== null && Math.abs(below.limitingFeature.heightM - 2000) < 1e-6, 'the limiting feature is the ridge');
  assert.ok(below.terrainHorizonDeg !== null && Math.abs(below.terrainHorizonDeg - alpha) < 0.05, `horizon ${below.terrainHorizonDeg} vs analytic ${alpha}`);
  assert.ok(below.marginDeg !== null && below.marginDeg < 0 && above.marginDeg !== null && above.marginDeg > 0);
});

test('the SAME ridge does not block the Sun in other directions, and not when it lies WEST of the site while the Sun is EAST (no mirroring)', () => {
  const lonFrom = 17 / KM_PER_DEGREE;
  const eastRidge = wall(lonFrom, lonFrom + 0.6 / KM_PER_DEGREE, 2000);
  const alpha = elevationOfPoint(0, 2, lonFrom);
  const el = alpha - 1; // would be blocked if the ridge were in the way
  const at = (field: HeightField, az: number) => terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, el, az)).status;
  assert.equal(at(eastRidge, 90), 'terrain-obstruction', 'Sun east, ridge east');
  assert.equal(at(eastRidge, 270), 'direct-sunlight', 'Sun west, ridge east');
  assert.equal(at(eastRidge, 0), 'direct-sunlight', 'Sun north');
  assert.equal(at(eastRidge, 180), 'direct-sunlight', 'Sun south');
  const westRidge = wall(-lonFrom - 0.6 / KM_PER_DEGREE, -lonFrom, 2000);
  assert.equal(at(westRidge, 90), 'direct-sunlight', 'Sun east, ridge WEST: a mirrored longitude would wrongly block');
  assert.equal(at(westRidge, 270), 'terrain-obstruction', 'Sun west, ridge west');
  // And the azimuth convention itself: azimuth 90 is the +Y (east) direction at (0, 0).
  const d = sunAt(0, 0, 0, 90);
  assert.ok(d.y > 0.999 && Math.abs(d.x) < 1e-9);
});

test('changing the Sun direction changes the result: sweeping elevation over a crater rim flips obstruction to sunlight exactly once, at the rim angle', () => {
  const lonFrom = 10 / KM_PER_DEGREE;
  const field = wall(lonFrom, lonFrom + 1 / KM_PER_DEGREE, 1500);
  const alpha = elevationOfPoint(0, 1.5, lonFrom);
  let flips = 0;
  let prev: string | null = null;
  let flipAt = NaN;
  for (let el = 0.2; el <= 30; el += 0.05) {
    const s = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, el, 90)).status;
    if (prev !== null && s !== prev) { flips++; flipAt = el; }
    prev = s;
  }
  assert.equal(flips, 1);
  assert.ok(Math.abs(flipAt - alpha) < 0.12, `flips at ${flipAt}, analytic ${alpha}`);
});

test('CURVATURE: a 1 km peak 100 km away lies BELOW the tangent plane (a flat-plane model would block the Sun, the sphere does not)', () => {
  const lon = 100 / KM_PER_DEGREE;
  const field = wall(lon, lon + 0.5 / KM_PER_DEGREE, 1000, 0.5);
  const alpha = elevationOfPoint(0, 1, lon);
  assert.ok(alpha < -0.5, `analytic elevation of the peak is ${alpha} degrees (negative: hidden behind the curve)`);
  const flatPlaneAngle = Math.atan2(1, 100) * DEG; // +0.57 deg
  const e = 0.2;
  assert.ok(e < flatPlaneAngle, 'a flat-plane model would call this blocked');
  assert.equal(terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, e, 90)).status, 'direct-sunlight');
  // The same peak 20 km away does block it (its elevation there is positive).
  const near = 20 / KM_PER_DEGREE;
  const field2 = wall(near, near + 0.5 / KM_PER_DEGREE, 1000, 0.5);
  assert.equal(terrainVisibility(field2, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, e, 90)).status, 'terrain-obstruction');
});

test('ELEVATION: raising the ridge changes the outcome; lowering it clears the Sun', () => {
  const lonFrom = 15 / KM_PER_DEGREE;
  const sun = sunAt(0, 0, 3, 90);
  const status = (h: number) => terrainVisibility(wall(lonFrom, lonFrom + 0.5 / KM_PER_DEGREE, h), { latDeg: 0, lonDeg: 0 }, sun).status;
  assert.equal(status(500), 'direct-sunlight'); // 500 m at 15 km is about 1.9 deg
  assert.equal(status(1500), 'terrain-obstruction'); // about 5.7 deg
  // The observer's own height matters too: a site 1.4 km up looks over the 1.5 km ridge.
  const up = functionHeightField({ id: 'terraced', effectiveSpacingKm: 0.1, maxHeightM: 1500, minHeightM: 0, fn: (lat, lon) => (lon >= lonFrom && lon <= lonFrom + 0.5 / KM_PER_DEGREE && Math.abs(lat) <= 2 ? 1500 : lon > -0.2 && lon < 0.2 && Math.abs(lat) < 0.2 ? 1400 : 0) });
  assert.equal(terrainVisibility(up, { latDeg: 0, lonDeg: 0 }, sun).status, 'direct-sunlight');
});

test('a site is not called terrain-shadowed merely because the Sun is below its local horizon; a summit can still see below its tangent plane', () => {
  // Flat plateau 3 km up: the Sun 1 degree below the local horizon is blocked by the ground itself, not by a "terrain shadow".
  const plateau = flat(3000);
  const r1 = terrainVisibility(plateau, { latDeg: 10, lonDeg: 10 }, sunAt(10, 10, -1, 45));
  assert.equal(r1.status, 'geometric-darkness');
  assert.equal(r1.belowLocalHorizon, true);
  // The smooth-sphere horizon of a 3 km-high point is acos(R / (R + 3)) below the tangent plane (3.35 deg).
  const dip = Math.acos(R / (R + 3)) * DEG;
  assert.ok(Math.abs(r1.horizonDipDeg - dip) < 1e-9);
  // Below even that, the Moon itself hides the Sun: no march at all.
  const r2 = terrainVisibility(plateau, { latDeg: 10, lonDeg: 10 }, sunAt(10, 10, -dip - 0.01, 45));
  assert.equal(r2.status, 'geometric-darkness');
  assert.equal(r2.sampling.ended, 'not-marched');
  // A narrow spire (radius ~0.3 km, 3 km high) with an observer on a 20 m mast: the terrain falls away, so the Sun at -2 degrees IS visible.
  const spire = functionHeightField({
    id: 'spire', effectiveSpacingKm: 0.05, maxHeightM: 3000, minHeightM: 0,
    fn: (lat, lon) => (Math.hypot(lat, lon) < 0.3 / KM_PER_DEGREE ? 3000 : 0),
  });
  const mast = terrainVisibility(spire, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, -2, 90), { observerHeightM: 20 });
  assert.equal(mast.status, 'direct-sunlight', mast.reason);
  assert.equal(mast.belowLocalHorizon, true);
  const ground = terrainVisibility(spire, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, -2, 90));
  assert.equal(ground.status, 'geometric-darkness', 'with no mast the spire top itself is in the way');
});

test('stopping rule is exact: the march ends where the ray rises above the highest terrain, not at a fixed range', () => {
  const field = functionHeightField({ id: 'f1', effectiveSpacingKm: 2, maxHeightM: 1000, minHeightM: 0, fn: () => 0 });
  const e = 0.5;
  const r = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, e, 90));
  const rP = R;
  const Pd = rP * Math.sin(e * RAD);
  const sStar = -Pd + Math.sqrt(Pd * Pd + (R + 1) ** 2 - rP * rP);
  const ds = 0.5 * 2;
  assert.equal(r.sampling.ended, 'clear-of-all-terrain');
  assert.equal(r.sampling.samples, Math.ceil(sStar / ds) - 1);
  assert.ok(r.sampling.samples < 200, `${r.sampling.samples} samples`);
});

test('polar crater: a floor deep inside is shadowed for every Sun azimuth up to the rim angle, even though the Sun is above the horizon; the rim crest stays lit', () => {
  // Axisymmetric crater centred ON THE SOUTH POLE: floor -2000 m to 8 km radius, wall to a +1500 m crest at 15-17 km, outer slope to 0 at 30 km.
  const profile = (km: number): number => {
    if (km <= 8) return -2000;
    if (km <= 15) return -2000 + (3500 * (km - 8)) / 7;
    if (km <= 17) return 1500;
    if (km <= 30) return 1500 - (1500 * (km - 17)) / 13;
    return 0;
  };
  const field = functionHeightField({
    id: 'polar-crater', effectiveSpacingKm: 0.5, maxHeightM: 1500, minHeightM: -2000,
    fn: (lat) => profile((lat + 90) * KM_PER_DEGREE),
  });
  // Independent reference: the horizon from the floor centre, by brute force over distance (same elevation formula as above).
  let ref = -Infinity;
  for (let km = 0.05; km < 80; km += 0.01) ref = Math.max(ref, elevationOfPoint(-2, profile(km) / 1000, km / KM_PER_DEGREE));
  assert.ok(ref > 10 && ref < 20, `reference horizon ${ref}`);
  const floor = { latDeg: -90, lonDeg: 0 };
  // At the pole azimuth is meaningless: build Sun directions from explicit horizontal vectors.
  const sunAtPole = (el: number, phiDeg: number): Vec3 => {
    const h = Math.cos(el * RAD);
    return { x: h * Math.cos(phiDeg * RAD), y: h * Math.sin(phiDeg * RAD), z: -Math.sin(el * RAD) };
  };
  for (let phi = 0; phi < 360; phi += 30) {
    const low = terrainVisibility(field, floor, sunAtPole(1.5, phi));
    assert.equal(low.status, 'terrain-obstruction', `phi ${phi}: ${low.reason}`);
    assert.ok(low.sunElevationDeg > 1.49 && low.sunElevationDeg < 1.51, 'the Sun IS above the geometric horizon here');
    assert.ok(low.terrainHorizonDeg !== null && Math.abs(low.terrainHorizonDeg - ref) < 0.1, `horizon ${low.terrainHorizonDeg} vs ${ref}`);
    assert.ok(low.limitingFeature !== null && low.limitingFeature.distanceKm > 8 && low.limitingFeature.distanceKm < 18, 'the crater wall / rim is the cause');
    assert.equal(terrainVisibility(field, floor, sunAtPole(ref + 0.3, phi)).status, 'direct-sunlight');
    assert.equal(terrainVisibility(field, floor, sunAtPole(ref - 0.3, phi)).status, 'terrain-obstruction');
  }
  // The rim crest at 16 km from the pole (lat -90 + 16/km-per-degree): lit at 0.5 degrees from any direction.
  const crest = { latDeg: -90 + 16 / KM_PER_DEGREE, lonDeg: 40 };
  for (let az = 0; az < 360; az += 45) {
    const r = terrainVisibility(field, crest, sunAt(crest.latDeg, crest.lonDeg, 0.5, az));
    assert.equal(r.status, 'direct-sunlight', `crest az ${az}: ${r.reason}`);
  }
});

test('polar safety: no NaN or exception at, or within a hair of, either pole, for any Sun direction', () => {
  const bump = functionHeightField({ id: 'bump', effectiveSpacingKm: 1, maxHeightM: 800, minHeightM: 0, fn: (lat) => (Math.abs(lat) > 89.5 ? 800 : 0) });
  for (const lat of [90, -90, 89.9999, -89.9999, 89.99, -89.5]) {
    for (let phi = 0; phi < 360; phi += 45) {
      const el = 1;
      const d: Vec3 = { x: Math.cos(el * RAD) * Math.cos(phi * RAD), y: Math.cos(el * RAD) * Math.sin(phi * RAD), z: Math.sin(el * RAD) * Math.sign(lat) };
      const r = terrainVisibility(bump, { latDeg: lat, lonDeg: 17 }, d);
      assert.ok(Number.isFinite(r.sunElevationDeg), `lat ${lat}`);
      assert.ok(['direct-sunlight', 'terrain-obstruction', 'geometric-darkness'].includes(r.status), `${lat}: ${r.status}`);
    }
  }
});

test('MISSING DATA: never read as "no terrain"; known obstructions still count; unrelated gaps are irrelevant', () => {
  const gap = (lat: number, lon: number): boolean => lon > 0.3 && lon < 0.4 && Math.abs(lat) < 1;
  const mk = (id: string, ridge: boolean) => functionHeightField({
    id, effectiveSpacingKm: 0.2, maxHeightM: 1000, minHeightM: 0,
    fn: (lat, lon) => (gap(lat, lon) ? null : ridge && lon > 0.1 && lon < 0.12 && Math.abs(lat) < 1 ? 1000 : 0),
  });
  const site = { latDeg: 0, lonDeg: 0 };
  const low = sunAt(0, 0, 0.3, 90);
  const none = terrainVisibility(mk('gap-only', false), site, low);
  assert.equal(none.status, 'unknown');
  assert.ok(none.sampling.missingSamples > 0 && /no terrain data/.test(none.reason));
  assert.equal(none.discVisibleFraction, null);
  const blocked = terrainVisibility(mk('ridge-then-gap', true), site, low);
  assert.equal(blocked.status, 'terrain-obstruction', 'a known ridge in front of the gap still blocks the Sun');
  assert.ok(blocked.limitations.some((l) => /no terrain data/.test(l)));
  // A high Sun leaves the ground region before reaching the gap: the gap is not needed, so the result is definite.
  assert.equal(terrainVisibility(mk('gap-only', false), site, sunAt(0, 0, 30, 90)).status, 'direct-sunlight');
  // No data at the site itself.
  const hole = functionHeightField({ id: 'hole', effectiveSpacingKm: 1, maxHeightM: 0, minHeightM: 0, fn: () => null });
  const r = terrainVisibility(hole, site, sunAt(0, 0, 10, 0));
  assert.equal(r.status, 'unknown');
  assert.equal(r.observer.groundHeightM, null);
});

test('sample budget: an exhausted budget is reported as unknown, never as sunlight', () => {
  const field = functionHeightField({ id: 'budget', effectiveSpacingKm: 0.1, maxHeightM: 5000, minHeightM: 0, fn: () => 0 });
  const r = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, 0.2, 90), { maxSamples: 50 });
  assert.equal(r.status, 'unknown');
  assert.equal(r.sampling.ended, 'sample-budget');
});

test('a ridge one raster cell wide is not stepped over (half-cell step), for Sun azimuths across a range', () => {
  const w = 720;
  const h = 360; // 0.5 degree cells, about 15.2 km
  const counts = new Uint16Array(w * h).fill(20000);
  const col = 364; // centre longitude -180 + 364.5 * 0.5 = 2.25 deg
  for (let r = 0; r < h; r++) counts[r * w + col] = 20000 + 2 * 3000; // one pixel wide, 3000 m
  const field = rasterHeightField(makeRaster(w, h, counts));
  assert.ok(Math.abs(field.effectiveSpacingKm - 0.5 * KM_PER_DEGREE) < 1e-9);
  assert.equal(field.maxHeightM, 3000);
  const alphaPeak = elevationOfPoint(0, 3, 2.25);
  for (const az of [70, 80, 90, 100, 110]) {
    const r = terrainVisibility(field, { latDeg: 0.25, lonDeg: 0 }, sunAt(0.25, 0, 0.5, az));
    assert.equal(r.status, 'terrain-obstruction', `az ${az}: ${r.reason} (peak seen at ${alphaPeak.toFixed(2)} deg)`);
  }
});

test('terrain heights are TRUE metres and visual exaggeration never reaches the engine', () => {
  const w = 720;
  const h = 360;
  const counts = new Uint16Array(w * h).fill(20000);
  counts[179 * w + 364] = 20000 + 2 * 1234; // row 179 is centred on latitude +0.25
  const raster = makeRaster(w, h, counts);
  const field = rasterHeightField(raster);
  // The sample at the pixel centre is the decoded height, exactly.
  assert.ok(Math.abs((field.heightMetres(0.25, 2.25) as number) - decodeHeightMetres(counts[179 * w + 364] as number)) < 1e-9);
  const run = () => terrainVisibility(field, { latDeg: 0.25, lonDeg: 0 }, sunAt(0.25, 0, 0.4, 90));
  const before = run();
  const e2 = exaggerationFromSearch('?exaggeration=2');
  const e0 = exaggerationFromSearch('?exaggeration=0');
  assert.notEqual(heightToSceneRadius(1234, e2), heightToSceneRadius(1234, e0), 'exaggeration really changes the DRAWN radius');
  assert.deepEqual(run(), before, 'but the scientific result is identical');
});

test('cross-check against the older horizon-profile engine on smooth terrain, at mid-latitudes and near the poles', (t) => {
  const w = 1440;
  const h = 720; // 0.25 degree cells
  const counts = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const lat = 90 - ((r + 0.5) * 180) / h;
    const lon = -180 + ((c + 0.5) * 360) / w;
    // Smooth ON THE SPHERE (a function of the unit vector), so it has no singularity at the poles. A function of
    // latitude and longitude separately would be multi-valued at a pole (a +-1.4 km cliff within one cell), which is
    // not a physical surface and makes any two sampling schemes disagree there.
    const cl = Math.cos(lat * RAD);
    const ux = cl * Math.cos(lon * RAD);
    const uy = cl * Math.sin(lon * RAD);
    const uz = Math.sin(lat * RAD);
    const m = 1400 * Math.sin(3.1 * ux + 1.3) * Math.cos(2.3 * uy - 0.4 * uz) + 900 * Math.sin(4.7 * uz + 2.1 * ux * uy);
    counts[r * w + c] = 20000 + Math.round(2 * m);
  }
  const raster = makeRaster(w, h, counts);
  const field = rasterHeightField(raster);
  let compared = 0;
  let worst = 0;
  for (const [lat, lon] of [[0, 0], [30, 45], [-60, -100], [89.5, 10], [-89.5, -160], [12, 170]] as const) {
    const profile = computeHorizonProfile(raster, lat, lon);
    const frame = siteFrame(lat, lon);
    for (let az = 0; az < 360; az += 15) {
      const old = horizonAngleAt(profile, az);
      // Terrain horizon: new engine along the same vertical plane vs the old profile (the old one is floored at 0).
      // A grazing Sun (0.02 deg) makes the ray cover the whole reachable range; a high Sun would only sample the near ground.
      const probe = terrainVisibility(field, { latDeg: lat, lonDeg: lon }, sunAt(lat, lon, 0.02, az));
      const mine = Math.max(0, probe.terrainHorizonDeg ?? 0);
      worst = Math.max(worst, Math.abs(mine - old));
      assert.ok(Math.abs(mine - old) < 0.25, `(${lat}, ${lon}) az ${az}: new ${mine.toFixed(3)} vs old ${old.toFixed(3)}`);
      // Classification a clear margin either side of the OLD horizon must agree.
      for (const [delta, expectBlocked] of [[0.5, false], [-0.5, true]] as const) {
        const el = old + delta;
        if (el <= 0) continue;
        const r = terrainVisibility(field, { latDeg: lat, lonDeg: lon }, directionFromAltAz(frame, el, az));
        assert.equal(r.status === 'terrain-obstruction', expectBlocked, `(${lat}, ${lon}) az ${az} el ${el.toFixed(2)}: ${r.status}`);
        compared++;
      }
    }
  }
  t.diagnostic(`${compared} classifications agree; worst terrain-horizon difference ${worst.toFixed(3)} deg over 6 sites x 24 azimuths (new ray-march vs old horizon profile)`);
  assert.ok(compared > 100);
  assert.ok(worst < 0.25);
  // And the azimuth the engine uses is the same one the old code reports.
  const d = sunAt(30, 45, 12, 123);
  assert.ok(Math.abs(sunAltAz(d, siteFrame(30, 45)).azimuthDeg - 123) < 1e-9);
});

test('Sun-disc fraction: half the disc at the horizon, none when the whole disc is below it, all when above', () => {
  assert.ok(Math.abs(discFractionAbove(0) - 0.5) < 1e-12);
  assert.equal(discFractionAbove(1), 0);
  assert.equal(discFractionAbove(-1), 1);
  let prev = 1;
  for (let h = -1; h <= 1; h += 0.05) { const f = discFractionAbove(h); assert.ok(f <= prev + 1e-12); prev = f; }
  // Sun centre exactly on a wall horizon: half the disc is visible.
  const lonFrom = 17 / KM_PER_DEGREE;
  const field = wall(lonFrom, lonFrom + 0.6 / KM_PER_DEGREE, 2000);
  const probe = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, 0.05, 90)); // grazing: covers the whole range
  const horizon = probe.terrainHorizonDeg as number;
  assert.ok(Math.abs(horizon - elevationOfPoint(0, 2, 17 / KM_PER_DEGREE)) < 0.05);
  const edge = terrainVisibility(field, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, horizon, 90));
  assert.ok(edge.discVisibleFraction !== null && Math.abs(edge.discVisibleFraction - 0.5) < 0.05, `fraction ${edge.discVisibleFraction}`);
  const rho = sunAngularRadiusDeg(1);
  assert.ok(rho > 0.26 && rho < 0.27, `${rho}`);
});

test('caching never returns a stale result: changes of terrain revision, site, time or Sun direction all recompute', () => {
  let height = 1500;
  let revision = 1;
  const lonFrom = 12 / KM_PER_DEGREE;
  const field: HeightField = {
    ...wall(lonFrom, lonFrom + 0.5 / KM_PER_DEGREE, 1500),
    get revision() { return revision; },
    get maxHeightM() { return Math.max(height, 0); },
    heightMetres: (lat, lon) => (lon >= lonFrom && lon <= lonFrom + 0.5 / KM_PER_DEGREE && Math.abs(lat) <= 2 ? height : 0),
  };
  const cache = new VisibilityCache(8);
  const site = { latDeg: 0, lonDeg: 0 };
  const sun = sunAt(0, 0, 4, 90);
  const a = cache.get(field, site, sun);
  const b = cache.get(field, site, sun);
  assert.equal(b, a, 'identical request is served from the cache');
  assert.deepEqual([cache.hits, cache.misses], [1, 1]);
  assert.equal(a.status, 'terrain-obstruction');
  // The terrain changes (and says so): the cache must not answer with the old result.
  height = 100;
  revision = 2;
  const c = cache.get(field, site, sun);
  assert.equal(c.status, 'direct-sunlight');
  assert.equal(cache.misses, 2);
  // A different time (Sun direction), site, observer height or option are different keys.
  cache.get(field, site, sunAt(0, 0, 4.001, 90));
  cache.get(field, { latDeg: 0.01, lonDeg: 0 }, sun);
  cache.get(field, site, sun, { observerHeightM: 5 });
  cache.get(field, site, sun, { stepFactor: 0.25 });
  assert.equal(cache.misses, 6);
  // Bounded: with capacity 2 the oldest entry is evicted.
  const small = new VisibilityCache(2);
  small.get(field, site, sunAt(0, 0, 1, 90));
  small.get(field, site, sunAt(0, 0, 2, 90));
  small.get(field, site, sunAt(0, 0, 3, 90));
  assert.equal(small.size, 2);
  small.get(field, site, sunAt(0, 0, 1, 90));
  assert.equal(small.misses, 4, 'the first entry was evicted and recomputed');
});

test('inputs are validated and results always say which source and spacing they rest on', () => {
  const f = flat();
  assert.throws(() => terrainVisibility(f, { latDeg: 95, lonDeg: 0 }, { x: 1, y: 0, z: 0 }), RangeError);
  assert.throws(() => terrainVisibility(f, { latDeg: 0, lonDeg: NaN }, { x: 1, y: 0, z: 0 }), RangeError);
  assert.throws(() => terrainVisibility(f, { latDeg: 0, lonDeg: 0 }, { x: 0, y: 0, z: 0 }), RangeError);
  const r = terrainVisibility(f, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, 10, 0));
  assert.equal(r.source.id, 'flat');
  assert.equal(r.source.effectiveSpacingKm, 1);
  assert.ok(r.limitations.some((l) => /effective spacing 1\.000 km/.test(l)));
  assert.ok(r.limitations.some((l) => /permanent shadow/.test(l)), 'a single instant never claims permanence');
  // A real-data source with no published accuracy says so (the synthetic source above declares an exact 0 m).
  const lola = rasterHeightField(makeRaster(8, 4, new Uint16Array(32).fill(20000)));
  const rl = terrainVisibility(lola, { latDeg: 0, lonDeg: 0 }, sunAt(0, 0, 10, 0));
  assert.ok(rl.limitations.some((l) => /vertical accuracy .* not known/.test(l)), 'unknown accuracy is stated, not invented');
  assert.ok(rl.limitations.some((l) => /area mean of about 1\.9 km/.test(l)), 'and the smoothing of cell means is stated');
});
