/**
 * Lunar elevation raster: decoding, geometry and sampling (pure maths, no
 * Three.js, no browser). Everything here can be tested in Node.
 *
 * DATA PRODUCT (documented by NASA, see docs/TERRAIN_DATA.md for links)
 *   NASA SVS "CGI Moon Kit" ldem_16_uint.tif, repackaged from the LRO LOLA
 *   gridded elevation product LDEM_16: 5760 x 2880 pixels, 16 per degree,
 *   unsigned 16-bit, centred on 0 degrees longitude. LOLA publishes signed
 *   16-bit counts in half-metres relative to a sphere of radius 1737.4 km;
 *   SVS added +20000 so every value is positive. So
 *       heightMetres = (count - 20000) / 2      (above the 1737.4 km sphere)
 *   This is a height above a REFERENCE SPHERE, not "above sea level".
 *   A LOLA pixel is the MEAN over its cell, and the pole is a point
 *   surrounded by the four central pixels (no pixel is centred on the pole).
 *
 * ASSUMPTIONS THAT THE DOCUMENTS DO NOT STATE (check with scripts/check-ldem.ts)
 *   - row 0 is the NORTH edge;
 *   - the left edge of column 0 is longitude -180 (east to the right).
 *   The functions below use exactly these two assumptions and nothing else.
 *
 * WHY NOT "ONE NEAREST PIXEL PER MESH VERTEX"
 *   The globe mesh duplicates its pole vertices (one per column) and its seam
 *   column. Sampling each duplicate separately gives coincident vertices
 *   different heights (tears and lighting artefacts), and a 256 x 128 quad
 *   spans about 22 x 22 raster pixels, so a single pixel aliases small
 *   craters into noise. buildVertexHeights() averages each vertex's whole cell
 *   (area-weighted) and gives every duplicate the same height by construction.
 */

export const MOON_REFERENCE_RADIUS_M = 1_737_400;
export const LDEM_UINT_OFFSET = 20_000;
export const LDEM_METRES_PER_COUNT = 0.5;

const DEG = Math.PI / 180;

/** Metres above the 1737.4 km reference sphere for one raw 16-bit count. */
export function decodeHeightMetres(count: number): number {
  return (count - LDEM_UINT_OFFSET) * LDEM_METRES_PER_COUNT;
}

/** Scene radius (Moon radius = 1) for a height. `exaggeration` 1 is true scale. */
export function heightToSceneRadius(heightMetres: number, exaggeration = 1): number {
  return 1 + (exaggeration * heightMetres) / MOON_REFERENCE_RADIUS_M;
}

export interface ElevationRaster {
  readonly width: number;
  readonly height: number;
  /** Raw unsigned 16-bit counts, row 0 first, row-major. */
  readonly counts: Uint16Array;
}

const MAX_DIMENSION = 1 << 15;

function checkDimensions(width: number, height: number): void {
  const ok = (n: number): boolean => Number.isInteger(n) && n >= 2 && n <= MAX_DIMENSION;
  if (!ok(width) || !ok(height)) throw new RangeError(`Raster size ${String(width)} x ${String(height)} is not valid.`);
  if (width % 2 !== 0) throw new RangeError('Raster width must be even (the pole lies between the two middle columns).');
}

export function makeRaster(width: number, height: number, counts: Uint16Array): ElevationRaster {
  checkDimensions(width, height);
  if (counts.length !== width * height) {
    throw new RangeError(`Raster needs ${String(width * height)} values but got ${String(counts.length)}.`);
  }
  return { width, height, counts };
}

/**
 * Read a RAW file of unsigned 16-bit LITTLE-ENDIAN values. The byte order is
 * decoded explicitly, so the result does not depend on the computer's own.
 * Throws RangeError (with a readable message) if the size does not match.
 */
export function parseRawUint16LE(buffer: ArrayBuffer, width: number, height: number): ElevationRaster {
  checkDimensions(width, height);
  const expected = width * height * 2;
  if (buffer.byteLength !== expected) {
    throw new RangeError(`Elevation file is ${String(buffer.byteLength)} bytes; a ${String(width)} x ${String(height)} 16-bit raster is ${String(expected)} bytes.`);
  }
  const view = new DataView(buffer);
  const counts = new Uint16Array(width * height);
  for (let i = 0; i < counts.length; i++) counts[i] = view.getUint16(i * 2, true);
  return { width, height, counts };
}

// ---- raster geometry ----------------------------------------------------------

/** Longitude (degrees east) of the CENTRE of column i. */
export function columnCentreLonDeg(raster: ElevationRaster, column: number): number {
  return -180 + ((column + 0.5) * 360) / raster.width;
}

/** Latitude (degrees north) of the CENTRE of row j. */
export function rowCentreLatDeg(raster: ElevationRaster, row: number): number {
  return 90 - ((row + 0.5) * 180) / raster.height;
}

/**
 * Raw count at (column, row), allowing indices outside the grid:
 *  - columns wrap around the sphere;
 *  - a row above the north edge (or below the south edge) is the row just
 *    inside it on the OPPOSITE meridian, which is what lies across a pole.
 */
export function countAt(raster: ElevationRaster, column: number, row: number): number {
  const w = raster.width;
  const h = raster.height;
  let c = column;
  let r = row;
  if (r < 0) {
    r = -1 - r;
    c += w / 2;
  } else if (r >= h) {
    r = 2 * h - 1 - r;
    c += w / 2;
  }
  c = ((c % w) + w) % w;
  const value = raster.counts[r * w + c];
  if (value === undefined) throw new RangeError('Raster index out of range.');
  return value;
}

function requireFinite(name: string, ...values: number[]): void {
  for (const v of values) if (!Number.isFinite(v)) throw new RangeError(`${name} must be a finite number.`);
}

/**
 * The simple method the first terrain version used: the one pixel containing
 * the point. Kept ONLY so tests and the check script can measure its defects
 * (different heights at coincident vertices). Do not use for rendering.
 */
export function sampleNearestMetres(raster: ElevationRaster, latDeg: number, lonDeg: number): number {
  requireFinite('Latitude and longitude', latDeg, lonDeg);
  const u = (lonDeg + 180) / 360;
  const v = (latDeg + 90) / 180;
  const column = Math.min(raster.width - 1, Math.max(0, Math.floor(u * raster.width)));
  const row = Math.min(raster.height - 1, Math.max(0, Math.floor((1 - v) * raster.height)));
  return decodeHeightMetres(countAt(raster, column, row));
}

/**
 * Bilinear interpolation between pixel CENTRES, with seam wrap-around and
 * pole reflection. Good for looking up a height at one point.
 */
export function sampleBilinearMetres(raster: ElevationRaster, latDeg: number, lonDeg: number): number {
  requireFinite('Latitude and longitude', latDeg, lonDeg);
  const lat = Math.min(90, Math.max(-90, latDeg));
  const fx = ((lonDeg + 180) / 360) * raster.width - 0.5;
  const fy = ((90 - lat) / 180) * raster.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = countAt(raster, x0, y0) * (1 - tx) + countAt(raster, x0 + 1, y0) * tx;
  const bottom = countAt(raster, x0, y0 + 1) * (1 - tx) + countAt(raster, x0 + 1, y0 + 1) * tx;
  return decodeHeightMetres(top * (1 - ty) + bottom * ty);
}

/**
 * Mean height over the box latLo..latHi, lonLo..lonHi (degrees). The mean is
 * weighted by true surface area: each pixel counts by the fraction of the box
 * it covers times its band's area, sin(lat2) - sin(lat1). The longitude range
 * may run past +-180 (it wraps) and may be a full 360 degrees (a polar cap).
 */
export function cellMeanHeightMetres(
  raster: ElevationRaster,
  latLoDeg: number,
  latHiDeg: number,
  lonLoDeg: number,
  lonHiDeg: number,
): number {
  requireFinite('Box', latLoDeg, latHiDeg, lonLoDeg, lonHiDeg);
  if (!(latLoDeg < latHiDeg) || latLoDeg < -90 - 1e-9 || latHiDeg > 90 + 1e-9) {
    throw new RangeError('Latitude range must satisfy -90 <= low < high <= 90.');
  }
  const span = lonHiDeg - lonLoDeg;
  if (!(span > 0) || span > 360 + 1e-9) throw new RangeError('Longitude range must be greater than 0 and at most 360 degrees.');

  const w = raster.width;
  const h = raster.height;
  const dLon = 360 / w;
  const dLat = 180 / h;

  const rowFirst = Math.max(0, Math.floor((90 - latHiDeg) / dLat));
  const rowLast = Math.min(h - 1, Math.ceil((90 - latLoDeg) / dLat) - 1);
  const kFirst = Math.floor((lonLoDeg + 180) / dLon);
  const kLast = Math.ceil((lonHiDeg + 180) / dLon) - 1;

  let sum = 0;
  let weightSum = 0;
  for (let row = rowFirst; row <= rowLast; row++) {
    const top = 90 - row * dLat;
    const bottom = top - dLat;
    const hi = Math.min(top, latHiDeg);
    const lo = Math.max(bottom, latLoDeg);
    if (!(hi > lo)) continue;
    const wLat = Math.sin(hi * DEG) - Math.sin(lo * DEG);
    for (let k = kFirst; k <= kLast; k++) {
      const left = -180 + k * dLon;
      const overlap = Math.min(lonHiDeg, left + dLon) - Math.max(lonLoDeg, left);
      if (!(overlap > 0)) continue;
      const weight = wLat * overlap;
      sum += weight * decodeHeightMetres(countAt(raster, k, row)); // average HEIGHTS (small numbers): least round-off
      weightSum += weight;
    }
  }
  if (!(weightSum > 0)) throw new RangeError('The box does not cover any raster cell.');
  return sum / weightSum;
}

// ---- mesh heights ---------------------------------------------------------------

/**
 * One height (metres) per vertex of the lat/lon sphere in src/sim/sphereMesh.ts,
 * in the SAME vertex order: row r = 0 is the north pole, c = 0..lonSegments with
 * c = lonSegments duplicating the seam column.
 *
 * Policy:
 *   - an ordinary vertex gets the area-weighted mean of its own cell
 *     (+-half a mesh step in latitude and longitude);
 *   - every vertex of a pole row gets ONE value: the mean over the polar cap
 *     of angular radius half a mesh step, all longitudes;
 *   - the seam duplicate (c = lonSegments) copies column 0.
 * So coincident vertices can never get different heights.
 */
export function buildVertexHeights(raster: ElevationRaster, lonSegments: number, latSegments: number): Float32Array {
  if (!Number.isInteger(lonSegments) || !Number.isInteger(latSegments) || lonSegments < 3 || latSegments < 2) {
    throw new RangeError('Mesh needs at least 3 longitude and 2 latitude segments (whole numbers).');
  }
  const cols = lonSegments + 1;
  const rows = latSegments + 1;
  const heights = new Float32Array(cols * rows);
  const halfLat = 90 / latSegments;
  const halfLon = 180 / lonSegments;

  for (let r = 0; r < rows; r++) {
    const lat = 90 - (180 * r) / latSegments;
    if (r === 0 || r === latSegments) {
      const cap = r === 0 ? cellMeanHeightMetres(raster, 90 - halfLat, 90, -180, 180) : cellMeanHeightMetres(raster, -90, -90 + halfLat, -180, 180);
      for (let c = 0; c < cols; c++) heights[r * cols + c] = cap;
      continue;
    }
    let seamValue = 0;
    for (let c = 0; c < lonSegments; c++) {
      const lon = -180 + (360 * c) / lonSegments;
      const h = cellMeanHeightMetres(raster, lat - halfLat, lat + halfLat, lon - halfLon, lon + halfLon);
      heights[r * cols + c] = h;
      if (c === 0) seamValue = h;
    }
    heights[r * cols + lonSegments] = seamValue; // the seam duplicate is a copy of column 0, never a separate sample
  }
  return heights;
}

/**
 * TEMPORARY A/B DIAGNOSTIC (pole spokes). Same as buildVertexHeights except for
 * ordinary rows (not the pole rows): the averaging box is as wide on the ground
 * east-west as it is north-south. Its longitude half-width is
 * halfLat / cos(lat), capped at a full ring. Pole rows and the seam copy follow
 * exactly the same rule as buildVertexHeights (they are taken from it). This is the
 * rule prototyped in scripts/check-pole-rings.ts, moved here unchanged.
 */
export function buildVertexHeightsIsotropic(raster: ElevationRaster, lonSegments: number, latSegments: number): Float32Array {
  const heights = buildVertexHeights(raster, lonSegments, latSegments); // validates sizes; pole rows are final
  const cols = lonSegments + 1;
  const halfLat = 90 / latSegments;
  for (let r = 1; r < latSegments; r++) {
    const lat = 90 - (180 * r) / latSegments;
    const halfLonDeg = Math.min(180, halfLat / Math.max(Math.cos(lat * DEG), 1e-6));
    let seam = 0;
    for (let c = 0; c < lonSegments; c++) {
      const lon = -180 + (360 * c) / lonSegments;
      const h =
        halfLonDeg >= 180
          ? cellMeanHeightMetres(raster, lat - halfLat, lat + halfLat, -180, 180)
          : cellMeanHeightMetres(raster, lat - halfLat, lat + halfLat, lon - halfLonDeg, lon + halfLonDeg);
      heights[r * cols + c] = h;
      if (c === 0) seam = h;
    }
    heights[r * cols + lonSegments] = seam;
  }
  return heights;
}

/** Which averaging rule fills the vertex heights. 'current' is the app's normal rule. */
export type HeightFootprint = 'current' | 'isotropic';

/**
 * TEMPORARY: read the A/B switch from a URL query string such as "?footprint=iso".
 * Anything else (missing, misspelt, empty) gives 'current', so the app only changes
 * when the switch is spelt exactly.
 */
export function footprintFromSearch(search: string): HeightFootprint {
  const value = new URLSearchParams(search).get('footprint');
  return value === 'iso' || value === 'isotropic' ? 'isotropic' : 'current';
}

/**
 * New vertex positions: each unit-sphere vertex is moved along its own
 * direction to radius 1 + exaggeration * height / 1737400.
 */
export function displacePositions(unitPositions: Float32Array, heightsMetres: Float32Array, exaggeration = 1): Float32Array {
  if (unitPositions.length !== heightsMetres.length * 3) throw new RangeError('Positions and heights do not match.');
  if (!Number.isFinite(exaggeration) || exaggeration < 0) throw new RangeError('Exaggeration must be zero or more.');
  const out = new Float32Array(unitPositions.length);
  for (let i = 0; i < heightsMetres.length; i++) {
    const x = unitPositions[i * 3] ?? 0;
    const y = unitPositions[i * 3 + 1] ?? 0;
    const z = unitPositions[i * 3 + 2] ?? 0;
    const len = Math.hypot(x, y, z);
    const h = heightsMetres[i] ?? 0;
    if (!(len > 0) || !Number.isFinite(h)) throw new RangeError(`Vertex ${String(i)} is not usable.`);
    const k = heightToSceneRadius(h, exaggeration) / len;
    out[i * 3] = x * k;
    out[i * 3 + 1] = y * k;
    out[i * 3 + 2] = z * k;
  }
  return out;
}

/**
 * Outward vertex normals for the displaced lat/lon grid, from the surface
 * itself (neighbouring vertices), not from the triangle list. Seam duplicates
 * get identical normals, and every pole vertex gets one shared normal, which
 * `computeVertexNormals()` cannot guarantee for duplicated vertices.
 */
export function gridNormals(positions: Float32Array, lonSegments: number, latSegments: number): Float32Array {
  const cols = lonSegments + 1;
  const rows = latSegments + 1;
  if (positions.length !== cols * rows * 3) throw new RangeError('Positions do not match the grid size.');
  const normals = new Float32Array(positions.length);
  const at = (r: number, c: number): [number, number, number] => {
    const cc = ((c % lonSegments) + lonSegments) % lonSegments;
    const i = (r * cols + cc) * 3;
    return [positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0];
  };
  const put = (r: number, c: number, n: [number, number, number]): void => {
    const i = (r * cols + c) * 3;
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  };
  const unit = (v: [number, number, number], fallback: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len > 1e-20 ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
  };

  for (let r = 1; r < latSegments; r++) {
    for (let c = 0; c < lonSegments; c++) {
      const east = at(r, c + 1);
      const west = at(r, c - 1);
      const north = at(r - 1, c);
      const south = at(r + 1, c);
      const tE: [number, number, number] = [east[0] - west[0], east[1] - west[1], east[2] - west[2]];
      const tS: [number, number, number] = [south[0] - north[0], south[1] - north[1], south[2] - north[2]];
      // cross(south tangent, east tangent) points OUTWARD in the scene axes of sceneMapping.ts.
      const n: [number, number, number] = [
        tS[1] * tE[2] - tS[2] * tE[1],
        tS[2] * tE[0] - tS[0] * tE[2],
        tS[0] * tE[1] - tS[1] * tE[0],
      ];
      const p = at(r, c);
      put(r, c, unit(n, unit(p, [0, 1, 0])));
    }
    const first = r * cols * 3;
    const last = (r * cols + lonSegments) * 3;
    for (let k = 0; k < 3; k++) normals[last + k] = normals[first + k] ?? 0;
  }

  // Poles: one shared normal, the average of the ring next to the pole.
  for (const [poleRow, ringRow] of [[0, 1], [latSegments, latSegments - 1]] as const) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let c = 0; c < lonSegments; c++) {
      const i = (ringRow * cols + c) * 3;
      sx += normals[i] ?? 0;
      sy += normals[i + 1] ?? 0;
      sz += normals[i + 2] ?? 0;
    }
    const n = unit([sx, sy, sz], [0, poleRow === 0 ? 1 : -1, 0]);
    for (let c = 0; c < cols; c++) put(poleRow, c, n);
  }
  return normals;
}

export interface TerrainMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly minHeightMetres: number;
  readonly maxHeightMetres: number;
}

/** The whole pipeline: heights -> displaced positions -> seam- and pole-safe normals. */
export function buildTerrainMesh(
  unitPositions: Float32Array,
  raster: ElevationRaster,
  lonSegments: number,
  latSegments: number,
  exaggeration = 1,
  footprint: HeightFootprint = 'current',
): TerrainMesh {
  const heights =
    footprint === 'isotropic'
      ? buildVertexHeightsIsotropic(raster, lonSegments, latSegments)
      : buildVertexHeights(raster, lonSegments, latSegments);
  const positions = displacePositions(unitPositions, heights, exaggeration);
  const normals = gridNormals(positions, lonSegments, latSegments);
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { positions, normals, minHeightMetres: min, maxHeightMetres: max };
}
