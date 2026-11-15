import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerrainMesh,
  buildVertexHeights,
  buildVertexHeightsIsotropic,
  cellMeanHeightMetres,
  columnCentreLonDeg,
  countAt,
  decodeHeightMetres,
  displacePositions,
  footprintFromSearch,
  gridNormals,
  heightToSceneRadius,
  makeRaster,
  parseRawUint16LE,
  rowCentreLatDeg,
  sampleBilinearMetres,
  sampleNearestMetres,
} from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';
import { buildLatLonSphere } from './sphereMesh.ts';

const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const ZERO = 20000; // count for height 0 m

/** Raster from a function of (column, row) giving a height in metres (must be a multiple of 0.5). */
function rasterFrom(width: number, height: number, metres: (c: number, r: number) => number): ElevationRaster {
  const counts = new Uint16Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) counts[r * width + c] = ZERO + Math.round(metres(c, r) * 2);
  return makeRaster(width, height, counts);
}

// ---- decoding ----------------------------------------------------------------

test('decode: known counts give the heights the documented encoding implies', () => {
  assert.equal(decodeHeightMetres(20000), 0);
  assert.equal(decodeHeightMetres(20002), 1);
  assert.equal(decodeHeightMetres(19998), -1);
  assert.equal(decodeHeightMetres(0), -10000);
  assert.equal(decodeHeightMetres(65535), 22767.5);
});

test('radius: 0 m is the unit sphere; heights and exaggeration scale as documented', () => {
  assert.equal(heightToSceneRadius(0), 1);
  close(heightToSceneRadius(1737.4), 1 + 1737.4 / 1_737_400);
  close(heightToSceneRadius(1737.4, 10), 1 + 10 * (1737.4 / 1_737_400));
  assert.ok(heightToSceneRadius(-5000) < 1);
});

// ---- reading files -----------------------------------------------------------

test('RAW reader: decodes little-endian (bytes 0x20 0x4E = 20000), not big-endian', () => {
  const buf = new Uint8Array([0x20, 0x4e, 0x22, 0x4e, 0x00, 0x00, 0xff, 0xff]).buffer; // 20000, 20002, 0, 65535
  const r = parseRawUint16LE(buf, 2, 2);
  assert.deepEqual(Array.from(r.counts), [20000, 20002, 0, 65535]);
});

test('RAW reader: refuses a file of the wrong size, and invalid dimensions', () => {
  assert.throws(() => parseRawUint16LE(new ArrayBuffer(6), 2, 2), RangeError);
  assert.throws(() => parseRawUint16LE(new ArrayBuffer(8), 3, 1), RangeError); // odd width, height < 2
  assert.throws(() => parseRawUint16LE(new ArrayBuffer(8), 0, 2), RangeError);
  assert.throws(() => parseRawUint16LE(new ArrayBuffer(8), 2.5, 2), RangeError);
  assert.throws(() => makeRaster(4, 2, new Uint16Array(7)), RangeError);
});

// ---- raster geometry ---------------------------------------------------------

test('geometry: pixel centres lie half a pixel inside the edges (8 x 4 raster = 45 degree pixels)', () => {
  const r = rasterFrom(8, 4, () => 0);
  close(columnCentreLonDeg(r, 0), -157.5);
  close(columnCentreLonDeg(r, 7), 157.5);
  close(rowCentreLatDeg(r, 0), 67.5);
  close(rowCentreLatDeg(r, 3), -67.5);
});

test('countAt: columns wrap; a row across a pole is the row inside it on the opposite meridian', () => {
  const r = rasterFrom(8, 4, (c, row) => c * 10 + row); // distinct values
  const v = (c: number, row: number) => countAt(r, c, row);
  assert.equal(v(-1, 2), v(7, 2));
  assert.equal(v(8, 2), v(0, 2));
  assert.equal(v(2, -1), v(2 + 4, 0));
  assert.equal(v(6, 4), v(6 + 4, 3));
});

// ---- point sampling ----------------------------------------------------------

test('bilinear: exact at pixel centres, halfway between two centres, and across the seam', () => {
  const r = rasterFrom(8, 4, (c) => (c === 7 ? 100 : 0)); // column 7 high, column 0 low
  close(sampleBilinearMetres(r, 22.5, columnCentreLonDeg(r, 7)), 100);
  close(sampleBilinearMetres(r, 22.5, columnCentreLonDeg(r, 0)), 0);
  close(sampleBilinearMetres(r, 22.5, -180), 50); // exactly between column 7 and column 0
  close(sampleBilinearMetres(r, 22.5, -180 + 1e-7), 50, 1e-4);
  close(sampleBilinearMetres(r, 22.5, 180 - 1e-7), 50, 1e-4);
});

test('bilinear: rejects non-finite input', () => {
  const r = rasterFrom(8, 4, () => 0);
  assert.throws(() => sampleBilinearMetres(r, Number.NaN, 0), RangeError);
  assert.throws(() => sampleBilinearMetres(r, 0, Infinity), RangeError);
});

// ---- cell means --------------------------------------------------------------

test('cell mean: constant raster gives that constant; a box equal to one pixel gives that pixel', () => {
  const flat = rasterFrom(16, 8, () => 123);
  close(cellMeanHeightMetres(flat, -10, 33, 17, 301), 123, 1e-9);
  const r = rasterFrom(8, 4, (c, row) => c * 10 + row * 100);
  // column 2 spans lon -90..-45, row 1 spans lat 0..45.
  close(cellMeanHeightMetres(r, 0, 45, -90, -45), 2 * 10 + 1 * 100);
});

test('cell mean: rows are weighted by surface AREA (sin latitude), worked by hand', () => {
  const r = rasterFrom(8, 4, (_c, row) => (row === 0 ? 100 : 0)); // row 0 (45..90 N) = 100 m, row 1 (0..45) = 0
  const expected = (100 * (Math.sin(Math.PI / 2) - Math.sin(Math.PI / 4))) / (Math.sin(Math.PI / 2) - 0);
  close(cellMeanHeightMetres(r, 0, 90, -180, 180), expected, 1e-9);
  assert.ok(Math.abs(expected - 29.2893218813) < 1e-6);
});

test('cell mean: a box across the seam combines both sides (equal overlap = plain average)', () => {
  const r = rasterFrom(8, 4, (c) => (c === 7 ? 100 : c === 0 ? 40 : 0));
  close(cellMeanHeightMetres(r, 0, 45, 170, 190), 70); // 10 degrees in column 7, 10 in column 0
  close(cellMeanHeightMetres(r, 0, 45, -190, -170), 70); // the same box written the other way
});

test('cell mean: a full-ring polar cap is the area mean of its rows and ignores longitude', () => {
  const r = rasterFrom(8, 4, (c, row) => (row === 0 ? c * 8 : 0)); // row 0 holds 0,8,...,56
  close(cellMeanHeightMetres(r, 45, 90, -180, 180), 28); // mean of 0..56
});

test('cell mean: invalid boxes throw', () => {
  const r = rasterFrom(8, 4, () => 0);
  assert.throws(() => cellMeanHeightMetres(r, 10, 10, 0, 10), RangeError);
  assert.throws(() => cellMeanHeightMetres(r, -91, 10, 0, 10), RangeError);
  assert.throws(() => cellMeanHeightMetres(r, 0, 10, 0, 361), RangeError);
  assert.throws(() => cellMeanHeightMetres(r, 0, 10, 5, 5), RangeError);
  assert.throws(() => cellMeanHeightMetres(r, 0, Number.NaN, 0, 10), RangeError);
});

// ---- mesh heights: seam and poles --------------------------------------------

const LON_SEG = 16;
const LAT_SEG = 8;
const COLS = LON_SEG + 1;

test('vertex heights: every pole vertex shares ONE height, and the seam duplicate equals column 0', () => {
  // Top and bottom rows of the raster differ from column to column, like a real polar ring.
  const r = rasterFrom(64, 32, (c, row) => (row < 2 || row > 29 ? ((c * 37) % 23) * 3 : (c % 5) * 7 + row));
  const h = buildVertexHeights(r, LON_SEG, LAT_SEG);
  for (const row of [0, LAT_SEG]) {
    const first = h[row * COLS];
    for (let c = 1; c < COLS; c++) assert.equal(h[row * COLS + c], first, `pole row ${row} column ${c}`);
  }
  for (let row = 0; row <= LAT_SEG; row++) assert.equal(h[row * COLS + LON_SEG], h[row * COLS], `seam row ${row}`);
});

test('vertex heights: a cell centred on the seam averages both sides of it', () => {
  // 16 columns of 22.5 degrees: columns 0-7 (lon -180..0) are 40 m, columns 8-15 (lon 0..180) are 100 m.
  const r = rasterFrom(16, 8, (c) => (c < 8 ? 40 : 100));
  const h = buildVertexHeights(r, 4, 4);
  // The mesh vertex at lon -180 has a cell of lon -225..-135: two columns of 100 m (14, 15) and two of 40 m (0, 1).
  const cols = 5; // 4 segments + the duplicated seam column
  assert.equal(h[2 * cols + 0], 70); // equator row
  assert.equal(h[2 * cols + 4], 70); // the seam duplicate
});

test('vertex heights: constant raster gives a constant mesh; north-only high ground raises only the north', () => {
  const flat = buildVertexHeights(rasterFrom(64, 32, () => 250), LON_SEG, LAT_SEG);
  for (const v of flat) close(v, 250, 1e-4);
  const north = buildVertexHeights(rasterFrom(64, 32, (_c, row) => (row < 16 ? 500 : 0)), LON_SEG, LAT_SEG);
  close(north[0] ?? NaN, 500, 1e-4);
  close(north[LAT_SEG * COLS] ?? NaN, 0, 1e-4);
  // a mid-latitude vertex in the northern half is high, one in the southern half is low
  close(north[2 * COLS + 3] ?? NaN, 500, 1e-4);
  close(north[6 * COLS + 3] ?? NaN, 0, 1e-4);
});

test('vertex heights: invalid mesh sizes throw', () => {
  const r = rasterFrom(8, 4, () => 0);
  assert.throws(() => buildVertexHeights(r, 2, 4), RangeError);
  assert.throws(() => buildVertexHeights(r, 8, 1), RangeError);
  assert.throws(() => buildVertexHeights(r, 8.5, 4), RangeError);
});

test('why this exists: nearest-pixel sampling gives COINCIDENT pole vertices different heights', () => {
  const r = rasterFrom(64, 32, (c, row) => (row === 0 ? ((c * 37) % 23) * 3 : 0));
  const heights = new Set<number>();
  for (let c = 0; c <= LON_SEG; c++) heights.add(sampleNearestMetres(r, 90, -180 + (360 * c) / LON_SEG));
  assert.ok(heights.size > 1, 'the old method disagrees with itself at one point');
  // ...while the new policy cannot.
  const fixed = buildVertexHeights(r, LON_SEG, LAT_SEG);
  assert.equal(new Set(Array.from(fixed.slice(0, COLS))).size, 1);
});

// ---- displacement, normals, winding ------------------------------------------

function bumpRaster(): ElevationRaster {
  // A smooth 4 km mound centred on longitude 0, latitude 0 (columns 31/32, rows 15/16 of 64 x 32).
  return rasterFrom(64, 32, (c, row) => {
    const lon = -180 + ((c + 0.5) * 360) / 64;
    const lat = 90 - ((row + 0.5) * 180) / 32;
    return Math.round(4000 * Math.exp(-((lon / 25) ** 2) - ((lat / 25) ** 2)) * 2) / 2;
  });
}

test('displacement: zero heights leave the unit sphere unchanged; a height moves a vertex radially by the documented amount', () => {
  const mesh = buildLatLonSphere(1, LON_SEG, LAT_SEG);
  const zero = displacePositions(mesh.positions, new Float32Array(mesh.vertexCount), 1);
  for (let i = 0; i < zero.length; i++) close(zero[i] ?? 0, mesh.positions[i] ?? 0, 1e-6);
  const heights = new Float32Array(mesh.vertexCount).fill(1737.4);
  const up = displacePositions(mesh.positions, heights, 1);
  for (let i = 0; i < mesh.vertexCount; i++) {
    close(Math.hypot(up[i * 3] ?? 0, up[i * 3 + 1] ?? 0, up[i * 3 + 2] ?? 0), 1 + 1737.4 / 1_737_400, 1e-6);
  }
  assert.throws(() => displacePositions(mesh.positions, new Float32Array(3), 1), RangeError);
  assert.throws(() => displacePositions(mesh.positions, heights, -1), RangeError);
  const bad = heights.slice();
  bad[5] = Number.NaN;
  assert.throws(() => displacePositions(mesh.positions, bad, 1), RangeError);
});

test('normals: on an undisplaced sphere they are radial and unit length; poles are +-Y; seam and poles are shared', () => {
  const mesh = buildLatLonSphere(1, 32, 16);
  const n = gridNormals(mesh.positions, 32, 16);
  const cols = 33;
  for (let r = 1; r < 16; r++) {
    for (let c = 0; c <= 32; c++) {
      const i = (r * cols + c) * 3;
      const dot = (n[i] ?? 0) * (mesh.positions[i] ?? 0) + (n[i + 1] ?? 0) * (mesh.positions[i + 1] ?? 0) + (n[i + 2] ?? 0) * (mesh.positions[i + 2] ?? 0);
      assert.ok(dot > 0.998, `row ${r} column ${c} dot ${dot}`);
      close(Math.hypot(n[i] ?? 0, n[i + 1] ?? 0, n[i + 2] ?? 0), 1, 1e-6);
    }
    for (let k = 0; k < 3; k++) assert.equal(n[(r * cols + 32) * 3 + k], n[r * cols * 3 + k]);
  }
  for (let c = 0; c < cols; c++) {
    close(n[c * 3 + 1] ?? 0, 1, 1e-6);
    close(n[(16 * cols + c) * 3 + 1] ?? 0, -1, 1e-6);
  }
});

test('normals: on a mound they lean AWAY from its summit, east of it toward east (-Z) and north of it toward north (+Y)', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const mesh = buildLatLonSphere(1, lonSeg, latSeg);
  const t = buildTerrainMesh(mesh.positions, bumpRaster(), lonSeg, latSeg, 60);
  const cols = lonSeg + 1;
  const idx = (lat: number, lon: number) => (Math.round((90 - lat) / (180 / latSeg)) * cols + Math.round((lon + 180) / (360 / lonSeg))) * 3;
  const eastOfSummit = idx(0, 30);
  const northOfSummit = idx(30, 0);
  // At lon 30 on the equator the outward direction is about (cos30, 0, -sin30); "east" tangent is about (-sin30, 0, -cos30).
  const nE = [t.normals[eastOfSummit] ?? 0, t.normals[eastOfSummit + 1] ?? 0, t.normals[eastOfSummit + 2] ?? 0];
  const radial = [Math.cos(Math.PI / 6), 0, -Math.sin(Math.PI / 6)];
  const east = [-Math.sin(Math.PI / 6), 0, -Math.cos(Math.PI / 6)];
  const dotE = nE[0]! * east[0]! + nE[1]! * east[1]! + nE[2]! * east[2]!;
  const dotR = nE[0]! * radial[0]! + nE[1]! * radial[1]! + nE[2]! * radial[2]!;
  assert.ok(dotE > 0.01, `normal should lean east, got ${dotE}`);
  assert.ok(dotR > 0.9);
  const nN = [t.normals[northOfSummit] ?? 0, t.normals[northOfSummit + 1] ?? 0, t.normals[northOfSummit + 2] ?? 0];
  const radialY = Math.sin((30 * Math.PI) / 180); // the +Y part of a purely radial normal at latitude 30
  assert.ok(nN[1]! > radialY, `north of the summit the normal should lean north: ${nN[1]} vs radial ${radialY}`);
});

test('terrain mesh: every non-degenerate triangle still faces outward, and ONLY the 2 x lonSegments pole triangles are degenerate', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const mesh = buildLatLonSphere(1, lonSeg, latSeg);
  const t = buildTerrainMesh(mesh.positions, bumpRaster(), lonSeg, latSeg, 60);
  let degenerate = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i] ?? 0, mesh.indices[i + 1] ?? 0, mesh.indices[i + 2] ?? 0];
    const p = (k: number) => [t.positions[k * 3] ?? 0, t.positions[k * 3 + 1] ?? 0, t.positions[k * 3 + 2] ?? 0] as const;
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const area2 = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (area2 < 1e-12) {
      degenerate++;
      continue;
    }
    const centroid = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    assert.ok(n[0]! * centroid[0]! + n[1]! * centroid[1]! + n[2]! * centroid[2]! > 0, `triangle ${i / 3} faces inward`);
  }
  assert.equal(degenerate, 2 * lonSeg);
});

test('terrain mesh: summary heights and vertex radii agree with the raster; extremes are reported', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const mesh = buildLatLonSphere(1, lonSeg, latSeg);
  const t = buildTerrainMesh(mesh.positions, bumpRaster(), lonSeg, latSeg, 1);
  assert.ok(t.maxHeightMetres > 1000 && t.maxHeightMetres <= 4000);
  assert.ok(t.minHeightMetres >= -1e-4);
  const summit = ((latSeg / 2) * (lonSeg + 1) + lonSeg / 2) * 3;
  const radius = Math.hypot(t.positions[summit] ?? 0, t.positions[summit + 1] ?? 0, t.positions[summit + 2] ?? 0);
  close(radius, heightToSceneRadius(t.maxHeightMetres), 1e-6);
});

// ---- temporary A/B diagnostic: isotropic averaging footprint --------------------

/** Alternating 100 m / 0 m sectors, each exactly one mesh cell wide (64 x 32 mesh), so the CURRENT rule sees a perfect comb. */
function sectorCombRaster(): ElevationRaster {
  return rasterFrom(1440, 720, (c) => {
    const lon = -180 + (c + 0.5) * 0.25;
    const k = Math.floor((lon + 180 - 2.8125) / 5.625);
    return (((k % 2) + 2) % 2) * 100;
  });
}

test('footprint switch: the default is the current rule, bit for bit', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const unit = buildLatLonSphere(1, lonSeg, latSeg).positions;
  const raster = sectorCombRaster();
  const implicit = buildTerrainMesh(unit, raster, lonSeg, latSeg, 1);
  const explicit = buildTerrainMesh(unit, raster, lonSeg, latSeg, 1, 'current');
  assert.deepEqual(implicit.positions, explicit.positions);
  assert.deepEqual(implicit.normals, explicit.normals);
  const viaHeights = displacePositions(unit, buildVertexHeights(raster, lonSeg, latSeg), 1);
  assert.deepEqual(implicit.positions, viaHeights);
});

test('isotropic footprint: both pole rows and the seam column obey the same sharing rules as the current rule', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const cols = lonSeg + 1;
  const raster = sectorCombRaster();
  const cur = buildVertexHeights(raster, lonSeg, latSeg);
  const iso = buildVertexHeightsIsotropic(raster, lonSeg, latSeg);
  assert.equal(iso.length, cur.length);
  for (const row of [0, latSeg]) {
    for (let c = 0; c < cols; c++) {
      assert.equal(iso[row * cols + c], iso[row * cols], `pole row ${row} column ${c}`);
      assert.equal(iso[row * cols + c], cur[row * cols + c], 'pole height is the same under both rules');
    }
  }
  for (let r = 0; r <= latSeg; r++) {
    assert.equal(iso[r * cols + lonSeg], iso[r * cols], `seam copy, row ${r}`);
    for (let c = 0; c < cols; c++) assert.ok(Number.isFinite(iso[r * cols + c]));
  }
});

test('isotropic footprint: identical to the current rule on a constant raster and at the equator', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const cols = lonSeg + 1;
  const flat = rasterFrom(1440, 720, () => 123.5);
  for (const v of buildVertexHeightsIsotropic(flat, lonSeg, latSeg)) close(v, 123.5, 1e-3);
  const raster = sectorCombRaster();
  const cur = buildVertexHeights(raster, lonSeg, latSeg);
  const iso = buildVertexHeightsIsotropic(raster, lonSeg, latSeg);
  for (let c = 0; c < cols; c++) close(iso[(latSeg / 2) * cols + c] as number, cur[(latSeg / 2) * cols + c] as number, 1e-3);
});

test('isotropic footprint: removes the east-west comb next to BOTH poles (current rule keeps it), without touching the equator', () => {
  const lonSeg = 64;
  const latSeg = 32;
  const cols = lonSeg + 1;
  const raster = sectorCombRaster();
  const cur = buildVertexHeights(raster, lonSeg, latSeg);
  const iso = buildVertexHeightsIsotropic(raster, lonSeg, latSeg);
  const maxStep = (h: Float32Array, r: number): number => {
    let m = 0;
    for (let c = 0; c < lonSeg; c++) m = Math.max(m, Math.abs((h[r * cols + ((c + 1) % lonSeg)] as number) - (h[r * cols + c] as number)));
    return m;
  };
  for (const r of [1, latSeg - 1]) {
    assert.ok(maxStep(cur, r) > 90, `current rule should keep the 100 m comb at row ${r}, got ${maxStep(cur, r)}`);
    assert.ok(maxStep(iso, r) < 25, `isotropic rule should flatten it at row ${r}, got ${maxStep(iso, r)}`);
  }
  assert.ok(maxStep(iso, latSeg / 2) > 90, 'at the equator the comb is real detail at mesh scale and must stay');
});

test('footprint switch: only an exact ?footprint=iso (or isotropic) turns the diagnostic on', () => {
  assert.equal(footprintFromSearch(''), 'current');
  assert.equal(footprintFromSearch('?mesh=512'), 'current');
  assert.equal(footprintFromSearch('?footprint='), 'current');
  assert.equal(footprintFromSearch('?footprint=ISO'), 'current');
  assert.equal(footprintFromSearch('?footprint=current'), 'current');
  assert.equal(footprintFromSearch('?footprint=iso'), 'isotropic');
  assert.equal(footprintFromSearch('?a=1&footprint=isotropic'), 'isotropic');
});
