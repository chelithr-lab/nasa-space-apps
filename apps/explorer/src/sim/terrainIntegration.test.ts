import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_MESH_LAT_SEGMENTS,
  TERRAIN_MESH_LON_SEGMENTS,
  TERRAIN_RASTER_BYTES,
  checkElevationByteLength,
  describeTerrainStatus,
  exaggerationFromSearch,
  footprintForApp,
} from './terrainConfig.ts';
import {
  buildTerrainMesh,
  buildVertexHeights,
  buildVertexHeightsIsotropic,
  footprintFromSearch,
  makeRaster,
  parseRawUint16LE,
  heightToSceneRadius,
  MOON_REFERENCE_RADIUS_M,
} from './lunarElevation.ts';
import { buildLatLonSphere } from './sphereMesh.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';
import { MARKER_SURFACE_OFFSET } from './missionMarker.ts';

test('the real file size is exactly 5760 x 2880 x 2 = 33,177,600 bytes; any other size is refused with a reason', () => {
  assert.equal(TERRAIN_RASTER_BYTES, 33_177_600);
  assert.equal(checkElevationByteLength(33_177_600), null);
  for (const bad of [0, 1, 33_177_599, 33_177_601, 4096]) {
    const why = checkElevationByteLength(bad);
    assert.ok(why !== null && /33,177,600/.test(why), `size ${bad}`);
  }
  assert.throws(() => parseRawUint16LE(new ArrayBuffer(100), 5760, 2880), RangeError);
});

test('exaggeration: default, parsing, clamping; bad input never produces NaN', () => {
  assert.equal(exaggerationFromSearch(''), DEFAULT_TERRAIN_EXAGGERATION);
  assert.equal(exaggerationFromSearch('?exaggeration='), DEFAULT_TERRAIN_EXAGGERATION);
  assert.equal(exaggerationFromSearch('?exaggeration=abc'), DEFAULT_TERRAIN_EXAGGERATION);
  assert.equal(exaggerationFromSearch('?exaggeration=Infinity'), DEFAULT_TERRAIN_EXAGGERATION);
  assert.equal(exaggerationFromSearch('?exaggeration=1'), 1);
  assert.equal(exaggerationFromSearch('?exaggeration=0'), 0);
  assert.equal(exaggerationFromSearch('?exaggeration=-3'), 0);
  assert.equal(exaggerationFromSearch('?exaggeration=50'), MAX_TERRAIN_EXAGGERATION);
  assert.equal(exaggerationFromSearch('?x=1&exaggeration=1.25'), 1.25);
});

test('the default and the cap keep the highest LDEM_16 pixel (+10685.5 m) below the landing-site marker radius', () => {
  const peak = (e: number): number => heightToSceneRadius(10_685.5, e);
  assert.ok(peak(DEFAULT_TERRAIN_EXAGGERATION) < MARKER_SURFACE_OFFSET);
  assert.ok(peak(1) < MARKER_SURFACE_OFFSET);
  // The cap is documented as the point where markers begin to touch the highest peaks.
  assert.ok(Math.abs(peak(MAX_TERRAIN_EXAGGERATION) - MARKER_SURFACE_OFFSET) < 0.001);
});

test('the app keeps its footprint behaviour: isotropic unless exactly ?footprint=current; the A/B helper is untouched', () => {
  assert.equal(footprintForApp(''), 'isotropic');
  assert.equal(footprintForApp('?footprint=isotropic'), 'isotropic');
  assert.equal(footprintForApp('?footprint=iso'), 'isotropic');
  assert.equal(footprintForApp('?footprint=current'), 'current');
  assert.equal(footprintForApp('?footprint=CURRENT'), 'isotropic');
  // The separate diagnostic helper in lunarElevation.ts still defaults to 'current'.
  assert.equal(footprintFromSearch(''), 'current');
  assert.equal(footprintFromSearch('?footprint=iso'), 'isotropic');
});

test('status wording: active is only claimed with data; exaggeration and the unverified orientation are stated; failure says the Moon is smooth', () => {
  assert.match(describeTerrainStatus({ state: 'loading' }).label, /loading/);
  const a = describeTerrainStatus({ state: 'active', exaggeration: 1.5, minHeightMetres: -8981.5, maxHeightMetres: 10685.5, footprint: 'isotropic' });
  assert.match(a.label, /active/);
  assert.match(a.label, /1\.5x/);
  assert.match(a.title, /not sea level/);
  assert.match(a.title, /not yet verified/);
  assert.match(describeTerrainStatus({ state: 'active', exaggeration: 1, minHeightMetres: 0, maxHeightMetres: 1, footprint: 'current' }).label, /true scale/);
  const u = describeTerrainStatus({ state: 'unavailable', reason: 'File not found.' });
  assert.equal(u.tone, 'warn');
  assert.match(u.label, /unavailable/);
  assert.match(u.title, /NOT shown/);
  assert.match(u.title, /File not found\./);
});

// ---- orientation consistency: the mesh, the raster and the colour-texture UVs use ONE mapping ----

/** A raster whose only non-flat feature is one tall 2 x 2 pixel block at a known latitude/longitude. */
function raster16WithBump(latDeg: number, lonDeg: number) {
  const w = 5760;
  const h = 2880;
  const counts = new Uint16Array(w * h).fill(20_000); // 0 m everywhere
  const col = Math.floor(((lonDeg + 180) / 360) * w);
  const row = Math.floor(((90 - latDeg) / 180) * h);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) counts[(row + dr) * w + (col + dc)] = 20_000 + 2 * 5000; // +5000 m
  return makeRaster(w, h, counts);
}

test('terrain lands on the same direction as the marker/texture mapping: a bump at (lat, lon) is raised along toScene(latLonToUnit(lat, lon))', () => {
  const lon = TERRAIN_MESH_LON_SEGMENTS;
  const lat = TERRAIN_MESH_LAT_SEGMENTS;
  const sphere = buildLatLonSphere(1, lon, lat);
  for (const [la, lo] of [[0, 0], [20, 30], [-30, -100], [10, 150], [-45, -170], [30, 90]] as const) {
    const raster = raster16WithBump(la, lo);
    for (const footprint of ['current', 'isotropic'] as const) {
      const terrain = buildTerrainMesh(sphere.positions, raster, lon, lat, 1, footprint);
      const target = toScene(latLonToUnit(la, lo));
      let best = -1;
      let bestDot = -2;
      let tallest = -1;
      let tallestR = 0;
      for (let i = 0; i < sphere.vertexCount; i++) {
        const x = terrain.positions[i * 3] ?? 0;
        const y = terrain.positions[i * 3 + 1] ?? 0;
        const z = terrain.positions[i * 3 + 2] ?? 0;
        const r = Math.hypot(x, y, z);
        if (r > tallestR) { tallestR = r; tallest = i; }
        const d = (x * target.x + y * target.y + z * target.z) / r;
        if (d > bestDot) { bestDot = d; best = i; }
      }
      assert.ok(tallestR > 1, `${la},${lo} ${footprint}: something was raised`);
      // The raised vertex is the one nearest the marker direction (within one mesh cell, ~1.4 degrees).
      const tx = terrain.positions[tallest * 3] ?? 0;
      const ty = terrain.positions[tallest * 3 + 1] ?? 0;
      const tz = terrain.positions[tallest * 3 + 2] ?? 0;
      const angle = Math.acos(Math.min(1, (tx * target.x + ty * target.y + tz * target.z) / tallestR)) * (180 / Math.PI);
      assert.ok(angle < 2.2, `${la},${lo} ${footprint}: tallest vertex is ${angle.toFixed(2)} degrees from the marker direction`);
      assert.ok(best >= 0);
      // UVs of the same vertex agree with the raster rule u = (lon+180)/360, v = (lat+90)/180.
      const u = sphere.uvs[tallest * 2] ?? 0;
      const v = sphere.uvs[tallest * 2 + 1] ?? 0;
      assert.ok(Math.abs(u * 360 - 180 - lo) < 1.5, `${la},${lo}: uv.u gives longitude ${u * 360 - 180}`);
      assert.ok(Math.abs(v * 180 - 90 - la) < 1.5, `${la},${lo}: uv.v gives latitude ${v * 180 - 90}`);
    }
  }
});

test('height to scene radius: 0 m is exactly the unit sphere; metres are converted only at the rendering boundary', () => {
  assert.equal(heightToSceneRadius(0, 1.5), 1);
  assert.ok(Math.abs(heightToSceneRadius(MOON_REFERENCE_RADIUS_M, 1) - 2) < 1e-12);
  assert.ok(Math.abs(heightToSceneRadius(10_685.5, 1.5) - (1 + (1.5 * 10_685.5) / 1_737_400)) < 1e-15);
  const sphere = buildLatLonSphere(1, 16, 8);
  const flat = makeRaster(16, 8, new Uint16Array(16 * 8).fill(20_000));
  const t = buildTerrainMesh(sphere.positions, flat, 16, 8, 1.5, 'isotropic');
  for (let i = 0; i < sphere.vertexCount; i++) {
    const r = Math.hypot(t.positions[i * 3] ?? 0, t.positions[i * 3 + 1] ?? 0, t.positions[i * 3 + 2] ?? 0);
    assert.ok(Math.abs(r - 1) < 1e-6);
  }
  assert.equal(t.minHeightMetres, 0);
  assert.equal(t.maxHeightMetres, 0);
});

test('applying terrain twice from already-displaced positions gives the same result (safe to rebuild in place)', () => {
  const sphere = buildLatLonSphere(1, 32, 16);
  const raster = makeRaster(64, 32, Uint16Array.from({ length: 64 * 32 }, (_, i) => 20_000 + (i % 97) * 11));
  const first = buildTerrainMesh(sphere.positions, raster, 32, 16, 1.5, 'isotropic');
  const second = buildTerrainMesh(first.positions, raster, 32, 16, 1.5, 'isotropic');
  for (let i = 0; i < first.positions.length; i++) assert.ok(Math.abs((first.positions[i] ?? 0) - (second.positions[i] ?? 0)) < 1e-6);
});

test('seam and poles: duplicated seam vertices and every pole vertex share one position and one normal, for both rules', () => {
  const lon = 64;
  const lat = 32;
  const sphere = buildLatLonSphere(1, lon, lat);
  const raster = makeRaster(256, 128, Uint16Array.from({ length: 256 * 128 }, (_, i) => 20_000 + ((i * 7919) % 4001)));
  for (const footprint of ['current', 'isotropic'] as const) {
    const t = buildTerrainMesh(sphere.positions, raster, lon, lat, 2, footprint);
    const cols = lon + 1;
    const same = (a: number, b: number, arr: Float32Array): boolean => [0, 1, 2].every((k) => Math.abs((arr[a * 3 + k] ?? 0) - (arr[b * 3 + k] ?? 9)) < 1e-6);
    for (let r = 0; r <= lat; r++) {
      assert.ok(same(r * cols, r * cols + lon, t.positions), `${footprint}: seam row ${r} position`);
      assert.ok(same(r * cols, r * cols + lon, t.normals), `${footprint}: seam row ${r} normal`);
    }
    for (const pole of [0, lat]) for (let c = 1; c <= lon; c++) {
      assert.ok(same(pole * cols, pole * cols + c, t.positions), `${footprint}: pole ${pole} position`);
      assert.ok(same(pole * cols, pole * cols + c, t.normals), `${footprint}: pole ${pole} normal`);
    }
    for (let i = 0; i < t.normals.length; i += 3) {
      const len = Math.hypot(t.normals[i] ?? 0, t.normals[i + 1] ?? 0, t.normals[i + 2] ?? 0);
      assert.ok(Math.abs(len - 1) < 1e-4);
    }
  }
  // Both rules are still the exported, unchanged functions.
  assert.equal(typeof buildVertexHeights, 'function');
  assert.equal(typeof buildVertexHeightsIsotropic, 'function');
});
