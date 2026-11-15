/**
 * Read-only check of the NASA lunar elevation file. It changes nothing.
 *
 * Run from the project folder:
 *     node scripts\check-ldem.ts
 * or with another file / size:
 *     node scripts\check-ldem.ts public\textures\ldem_16_uint.raw 5760 2880
 *
 * It answers, with numbers: is the file the right size, what are its lowest and
 * highest points and WHERE (to see whether north/south and east/west are the way
 * round the code assumes), how the longitude seam and the poles behave, and how
 * much detail a 256 x 128 or 512 x 256 mesh keeps. It cannot PROVE the geographic
 * orientation; it reports whether the file is CONSISTENT with NASA's published
 * description (see docs/TERRAIN_DATA.md).
 */
import { readFileSync } from 'node:fs';
import {
  buildVertexHeights,
  cellMeanHeightMetres,
  columnCentreLonDeg,
  decodeHeightMetres,
  parseRawUint16LE,
  rowCentreLatDeg,
  sampleNearestMetres,
} from '../src/sim/lunarElevation.ts';

const path = process.argv[2] ?? 'public/textures/ldem_16_uint.raw';
const width = Number(process.argv[3] ?? 5760);
const height = Number(process.argv[4] ?? 2880);

const fmt = (n: number, d = 1): string => n.toFixed(d);
const line = (s = ''): void => console.log(s);
let problems = 0;
const verdict = (ok: boolean, text: string): void => {
  if (!ok) problems++;
  line(`  [${ok ? 'PASS' : 'CHECK'}] ${text}`);
};

line(`File: ${path}`);
let buffer: ArrayBuffer;
try {
  const bytes = readFileSync(path);
  buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
} catch (e) {
  line(`  [FAIL] cannot read the file: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
line(`  size: ${buffer.byteLength.toLocaleString('en-US')} bytes (expected ${(width * height * 2).toLocaleString('en-US')} for ${width} x ${height} x 2)`);
let raster;
try {
  raster = parseRawUint16LE(buffer, width, height);
} catch (e) {
  line(`  [FAIL] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
verdict(true, 'size matches a 16-bit raster of this width and height');

// ---- 1. values and extremes ----------------------------------------------------
line();
line('1. Values (metres above the 1737.4 km reference sphere, from (count - 20000) / 2)');
let minI = 0;
let maxI = 0;
let zeros = 0;
let full = 0;
const c = raster.counts;
for (let i = 0; i < c.length; i++) {
  const v = c[i] as number;
  if (v < (c[minI] as number)) minI = i;
  if (v > (c[maxI] as number)) maxI = i;
  if (v === 0) zeros++;
  if (v === 65535) full++;
}
const where = (i: number): string => {
  const col = i % width;
  const row = Math.floor(i / width);
  const lat = rowCentreLatDeg(raster, row);
  const lon = columnCentreLonDeg(raster, col);
  return `lat ${fmt(lat, 2)}, lon ${fmt(lon, 2)} (row ${row}, column ${col})`;
};
line(`  lowest : ${fmt(decodeHeightMetres(c[minI] as number))} m at ${where(minI)}`);
line(`  highest: ${fmt(decodeHeightMetres(c[maxI] as number))} m at ${where(maxI)}`);
line(`  pixels equal to 0 or 65535 (possible "no data" markers): ${zeros + full}`);
verdict(zeros + full === 0, 'no 0 or 65535 values that could be "no data" fill');

// ---- 2. orientation consistency ------------------------------------------------
line();
line('2. Orientation: is the file consistent with the published description?');
line('   NASA (science.nasa.gov, "What is the South Pole-Aitken Basin?"): the basin is on the FAR side, at the');
line('   southern edge as seen from Earth, and is the Moon\'s deepest basin. So the lowest point should be in the');
line('   SOUTHERN hemisphere and on the FAR side (|longitude| > 90).');
const minRow = Math.floor(minI / width);
const minCol = minI % width;
const minLat = rowCentreLatDeg(raster, minRow);
const minLon = columnCentreLonDeg(raster, minCol);
verdict(minLat < 0, `lowest point is in the southern hemisphere (lat ${fmt(minLat, 2)}). If this says CHECK, the rows may be upside down.`);
verdict(Math.abs(minLon) > 90, `lowest point is on the far side (lon ${fmt(minLon, 2)}). If this says CHECK, the longitude origin may be shifted by 180 degrees.`);
const nearMean = cellMeanHeightMetres(raster, -90, 90, -90, 90);
const farMean = (cellMeanHeightMetres(raster, -90, 90, 90, 180) + cellMeanHeightMetres(raster, -90, 90, -180, -90)) / 2;
line(`  (information) area-mean height, near side (|lon| < 90): ${fmt(nearMean)} m; far side: ${fmt(farMean)} m`);
line('  This check cannot detect an EAST-WEST mirror image. The browser check in the README (dark seas sit in');
line('  low ground) covers that.');

// ---- 3. longitude seam ---------------------------------------------------------
line();
line('3. Longitude seam (column 0 is next to the last column across lon +-180)');
let seamSum = 0;
let besideSum = 0;
let n = 0;
const rowLo = Math.floor(height * 0.15);
const rowHi = Math.ceil(height * 0.85);
const half = (r: number, col: number): number => (c[r * width + col] as number) / 2; // height in metres, up to a constant
for (let r = rowLo; r < rowHi; r++) {
  seamSum += Math.abs(half(r, 0) - half(r, width - 1)); // step ACROSS the seam
  // steps right BESIDE the seam, on either side of it (same place, same terrain)
  besideSum += (Math.abs(half(r, 1) - half(r, 0)) + Math.abs(half(r, width - 1) - half(r, width - 2))) / 2;
  n++;
}
const seamMean = seamSum / n;
const besideMean = besideSum / n;
line(`  mean |height step| ACROSS the seam (last column to column 0): ${fmt(seamMean, 2)} m`);
line(`  mean |height step| between the two columns just beside it:    ${fmt(besideMean, 2)} m`);
verdict(seamMean <= 2 * Math.max(besideMean, 1), 'the step across the seam is no bigger than the steps next to it, so wrap-around is the right policy');

// ---- 4. poles ------------------------------------------------------------------
line();
line('4. Poles (the raster has no pixel exactly at a pole; 4 pixels surround it)');
for (const [name, row, lat] of [['north', 0, 90], ['south', height - 1, -90]] as const) {
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  for (let col = 0; col < width; col++) {
    const h = decodeHeightMetres(c[row * width + col] as number);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
    sum += h;
  }
  const lonSeg = 256;
  const old = new Set<number>();
  for (let k = 0; k <= lonSeg; k++) old.add(sampleNearestMetres(raster, lat, -180 + (360 * k) / lonSeg));
  const oldMin = Math.min(...old);
  const oldMax = Math.max(...old);
  const cap = cellMeanHeightMetres(raster, lat > 0 ? 90 - 90 / 128 : -90, lat > 0 ? 90 : -90 + 90 / 128, -180, 180);
  line(`  ${name}: edge row heights ${fmt(lo)} .. ${fmt(hi)} m (mean ${fmt(sum / width)} m)`);
  line(`         OLD method, 257 coincident pole vertices: ${old.size} different heights, ${fmt(oldMin)} .. ${fmt(oldMax)} m (spread ${fmt(oldMax - oldMin)} m)`);
  line(`         NEW method: one height for all of them: ${fmt(cap)} m (mean over the ${fmt(90 / 128, 2)} degree polar cap)`);
}

// ---- 5. mesh detail ------------------------------------------------------------
line();
line('5. What a mesh keeps of the raster (area-averaged heights per vertex)');
for (const [lonSeg, latSeg] of [[256, 128], [512, 256]] as const) {
  const t0 = performance.now();
  const h = buildVertexHeights(raster, lonSeg, latSeg);
  const ms = performance.now() - t0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  line(`  ${lonSeg} x ${latSeg}: ${((lonSeg + 1) * (latSeg + 1)).toLocaleString('en-US')} vertices, ${fmt(360 / lonSeg, 3)} deg spacing; heights ${fmt(lo)} .. ${fmt(hi)} m; computed in ${fmt(ms, 0)} ms on this computer`);
}
line('  (A coarse mesh averages away narrow peaks and pits, so its extremes are smaller than the raster\'s. That is');
line('   a resolution limit, not an error.)');

line();
line(problems === 0 ? 'Result: nothing needs attention. Send me this whole output anyway.' : `Result: ${problems} item(s) marked CHECK. Send me this whole output.`);
