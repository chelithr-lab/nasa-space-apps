import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READOUT_PROMPT, formatReadout, readoutAtScenePoint, sceneDirectionToLatLon } from './pointReadout.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';
import { makeRaster, sampleBilinearMetres } from './lunarElevation.ts';
import { wrapLonDeg } from './orientationCheck.ts';
import { moonCameraPose, screenBasis } from './cameraPresets.ts';

function scenePoint(lat: number, lon: number, radius = 1) {
  const s = toScene(latLonToUnit(lat, lon));
  return { x: s.x * radius, y: s.y * radius, z: s.z * radius };
}

test('round trip: latLonToUnit -> toScene -> readout returns the same latitude and longitude, at any radius', () => {
  for (const [lat, lon] of [[0, 0], [20, 30], [-43.31, -11.36], [-20.38, 128.97], [9.62, -20.08], [60, 179.9], [-60, -179.9], [0, 90], [0, -90], [0, 180]] as const) {
    for (const radius of [0.99, 1, 1.006, 1.012]) {
      const p = scenePoint(lat, lon, radius);
      const r = sceneDirectionToLatLon(p.x, p.y, p.z);
      assert.ok(r !== null && r.lonDeg !== null);
      assert.ok(Math.abs(r.latDeg - lat) < 1e-9, `${lat},${lon} lat ${r.latDeg}`);
      assert.ok(Math.abs(wrapLonDeg(r.lonDeg - lon)) < 1e-9, `${lat},${lon} lon ${r.lonDeg}`);
    }
  }
});

test('scene axes: +X is (0, 0), -Z is 90 E, +Z is 90 W, +Y is the north pole', () => {
  assert.deepEqual(sceneDirectionToLatLon(1, 0, 0), { latDeg: 0, lonDeg: 0 });
  const east = sceneDirectionToLatLon(0, 0, -1);
  assert.ok(east !== null && east.lonDeg !== null && Math.abs(east.lonDeg - 90) < 1e-9);
  const west = sceneDirectionToLatLon(0, 0, 1);
  assert.ok(west !== null && west.lonDeg !== null && Math.abs(west.lonDeg + 90) < 1e-9);
  assert.equal(sceneDirectionToLatLon(0, 1, 0)?.latDeg, 90);
});

test('the near-side camera has EAST on its right, and the readout agrees (a camera-orientation check)', () => {
  const near = screenBasis(moonCameraPose('nearSide', 4.2));
  const stepRight = sceneDirectionToLatLon(1 + 0.1 * near.right.x, 0.1 * near.right.y, 0.1 * near.right.z);
  assert.ok(stepRight !== null && stepRight.lonDeg !== null && stepRight.lonDeg > 0, 'right of centre on the near side is east');
  const stepUp = sceneDirectionToLatLon(1 + 0.1 * near.up.x, 0.1 * near.up.y, 0.1 * near.up.z);
  assert.ok(stepUp !== null && stepUp.latDeg > 0, 'up on the near side is north');
});

test('the far-side camera has EAST on its left and the centre of the view is longitude 180', () => {
  const far = screenBasis(moonCameraPose('farSide', 4.2));
  const centre = sceneDirectionToLatLon(-1, 0, 0);
  assert.equal(centre?.lonDeg, 180);
  const stepRight = sceneDirectionToLatLon(-1 + 0.1 * far.right.x, 0.1 * far.right.y, 0.1 * far.right.z);
  assert.ok(stepRight !== null && stepRight.lonDeg !== null && stepRight.lonDeg < 0 && stepRight.lonDeg > -180, 'right of centre on the far side is WEST (-179.x)');
  const stepLeft = sceneDirectionToLatLon(-1 - 0.1 * far.right.x, -0.1 * far.right.y, -0.1 * far.right.z);
  assert.ok(stepLeft !== null && stepLeft.lonDeg !== null && stepLeft.lonDeg > 0 && stepLeft.lonDeg < 180, 'left of centre on the far side is EAST (179.x)');
});

test('the longitude seam: both sides of +-180 are reported on the correct side and +-180 itself as 180', () => {
  const justEast = sceneDirectionToLatLon(-1, 0, -0.001);
  const justWest = sceneDirectionToLatLon(-1, 0, 0.001);
  assert.ok(justEast?.lonDeg !== null && (justEast?.lonDeg ?? 0) > 179.9 && (justEast?.lonDeg ?? 0) < 180);
  assert.ok(justWest?.lonDeg !== null && (justWest?.lonDeg ?? 0) < -179.9 && (justWest?.lonDeg ?? 0) > -180);
  assert.equal(sceneDirectionToLatLon(-1, 0, 0)?.lonDeg, 180);
  assert.equal(sceneDirectionToLatLon(-1, 0, -0)?.lonDeg, 180);
});

test('poles: latitude is +-90, longitude is reported as undefined, never NaN', () => {
  for (const p of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 1e-9, y: 1, z: -1e-9 }, { x: 1e-4, y: -1, z: 3e-5 }]) {
    const r = sceneDirectionToLatLon(p.x, p.y, p.z);
    assert.ok(r !== null);
    assert.ok(Math.abs(Math.abs(r.latDeg) - 90) < 0.01);
    assert.equal(r.lonDeg, null);
  }
  const text = formatReadout({ latDeg: 90, lonDeg: null, heightMetres: 120 }, 1.5);
  assert.match(text.position, /90\.0° N, longitude undefined at the pole/);
  assert.ok(!/NaN/.test(JSON.stringify(text)));
});

test('unusable input gives null, not a bad number', () => {
  assert.equal(sceneDirectionToLatLon(NaN, 0, 0), null);
  assert.equal(sceneDirectionToLatLon(Infinity, 0, 0), null);
  assert.equal(sceneDirectionToLatLon(0, 0, 0), null);
  assert.equal(readoutAtScenePoint(0, 0, 0, null), null);
});

test('height is the raster value at that latitude/longitude (bilinear), independent of the radius the point is at', () => {
  const w = 16;
  const h = 8;
  const counts = Uint16Array.from({ length: w * h }, (_, i) => 20_000 + (i % w) * 100 + Math.floor(i / w) * 7);
  const raster = makeRaster(w, h, counts);
  for (const [lat, lon] of [[10, 33], [-40, -120], [5, 179], [5, -179]] as const) {
    const expected = sampleBilinearMetres(raster, lat, lon);
    for (const radius of [1, 1.004, 1.0123]) {
      const p = scenePoint(lat, lon, radius);
      const r = readoutAtScenePoint(p.x, p.y, p.z, raster);
      assert.ok(r !== null && r.heightMetres !== null);
      assert.ok(Math.abs(r.heightMetres - expected) < 1e-6, `${lat},${lon}: ${r.heightMetres} vs ${expected}`);
    }
  }
});

test('without terrain data the height is null and says so', () => {
  const p = scenePoint(10, 20);
  const r = readoutAtScenePoint(p.x, p.y, p.z, null);
  assert.ok(r !== null);
  assert.equal(r.heightMetres, null);
  assert.match(formatReadout(r, 1.5).height, /terrain data not loaded/);
});

test('formatting: units, signs, rounding to 10 m, hemispheres, and the exaggeration caveat', () => {
  const a = formatReadout({ latDeg: -43.314, lonDeg: -11.36, heightMetres: -1234.4 }, 1.5);
  assert.equal(a.position, '43.3° S, 11.4° W');
  assert.match(a.height, /^height −1,230 m above the 1737\.4 km reference sphere$/);
  assert.match(a.title, /exaggerated 1\.5x/);
  assert.match(a.title, /not sea level/);
  assert.match(a.title, /interpolated/);
  const b = formatReadout({ latDeg: 0.01, lonDeg: 180, heightMetres: 4 }, 1);
  assert.equal(b.position, '0.0°, 180.0°');
  assert.match(b.height, /^height 0 m/);
  assert.match(b.title, /true scale/);
  assert.match(formatReadout({ latDeg: 12, lonDeg: 3, heightMetres: 2504 }, 1).height, /\+2,500 m/);
  assert.ok(READOUT_PROMPT.length > 10);
});
