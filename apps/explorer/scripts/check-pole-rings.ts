/**
 * Read-only diagnostic: how steep does the globe look, ring by ring, near the poles?
 * It changes nothing in the project.
 *
 *     node scripts\check-pole-rings.ts
 *
 * For the 256 x 128 mesh it takes the real elevation file, builds the displaced globe
 * exactly as the app does (src/sim/lunarElevation.ts), and for the rings next to each
 * pole prints:
 *   - how long a mesh triangle is east-west and north-south (km) near the pole;
 *   - the biggest height step between neighbouring vertices of the ring (m);
 *   - the steepest local slope that step implies (degrees);
 *   - how far the SHADING normal leans away from straight-out ("tilt"), for
 *       (a) the normals the terrain module computes, and
 *       (b) the normals Three.js computeVertexNormals() would compute from the triangles.
 * Real lunar slopes are almost always under 30 degrees at the scale of these cells;
 * a ring whose tilt is large compared with the ring at the equator, and which swings from
 * vertex to vertex, will look like spokes in shading.
 *
 * It then repeats the measurement with a PROTOTYPE height rule whose averaging footprint
 * is as wide east-west as it is north-south (so the cell is not a thin sliver near the pole).
 * The prototype now lives in src/sim/lunarElevation.ts (buildVertexHeightsIsotropic), shared with the app's A/B switch.
 */
import { readFileSync } from 'node:fs';
import {
  buildVertexHeights,
  buildVertexHeightsIsotropic,
  displacePositions,
  gridNormals,
  parseRawUint16LE,
} from '../src/sim/lunarElevation.ts';
import type { ElevationRaster } from '../src/sim/lunarElevation.ts';
import { buildLatLonSphere } from '../src/sim/sphereMesh.ts';

const path = process.argv[2] ?? 'public/textures/ldem_16_uint.raw';
const width = Number(process.argv[3] ?? 5760);
const height = Number(process.argv[4] ?? 2880);
const LON = 256;
const LAT = 128;
const COLS = LON + 1;
const R_KM = 1737.4;
const line = (s = ''): void => console.log(s);

const bytes = readFileSync(path);
const raster: ElevationRaster = parseRawUint16LE(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  width,
  height,
);

const mesh = buildLatLonSphere(1, LON, LAT);

/** What THREE.BufferGeometry.computeVertexNormals() does for this indexed mesh: area-weighted face normals summed per vertex. */
function faceNormalSum(positions: Float32Array): Float32Array {
  const n = new Float32Array(positions.length);
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = (idx[i] as number) * 3;
    const b = (idx[i + 1] as number) * 3;
    const c = (idx[i + 2] as number) * 3;
    const ux = (positions[b] as number) - (positions[a] as number);
    const uy = (positions[b + 1] as number) - (positions[a + 1] as number);
    const uz = (positions[b + 2] as number) - (positions[a + 2] as number);
    const vx = (positions[c] as number) - (positions[a] as number);
    const vy = (positions[c + 1] as number) - (positions[a + 1] as number);
    const vz = (positions[c + 2] as number) - (positions[a + 2] as number);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] = (n[k] as number) + nx;
      n[k + 1] = (n[k + 1] as number) + ny;
      n[k + 2] = (n[k + 2] as number) + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i] as number, n[i + 1] as number, n[i + 2] as number) || 1;
    n[i] = (n[i] as number) / len;
    n[i + 1] = (n[i + 1] as number) / len;
    n[i + 2] = (n[i + 2] as number) / len;
  }
  return n;
}

/** Largest angle (degrees) between a ring's normals and straight-out, and the biggest jump between neighbours. */
function tilt(positions: Float32Array, normals: Float32Array, r: number): { max: number; jump: number } {
  let max = 0;
  let jump = 0;
  let prev: number[] | null = null;
  for (let c = 0; c < LON; c++) {
    const i = (r * COLS + c) * 3;
    const px = positions[i] as number;
    const py = positions[i + 1] as number;
    const pz = positions[i + 2] as number;
    const pl = Math.hypot(px, py, pz);
    const nx = normals[i] as number;
    const ny = normals[i + 1] as number;
    const nz = normals[i + 2] as number;
    const cos = (nx * px + ny * py + nz * pz) / (pl * Math.hypot(nx, ny, nz));
    max = Math.max(max, (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI);
    if (prev !== null) {
      const d = nx * (prev[0] as number) + ny * (prev[1] as number) + nz * (prev[2] as number);
      jump = Math.max(jump, (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI);
    }
    prev = [nx, ny, nz];
  }
  return { max, jump };
}

function report(title: string, heights: Float32Array): void {
  const positions = displacePositions(mesh.positions, heights, 1);
  const analytic = gridNormals(positions, LON, LAT);
  const faces = faceNormalSum(positions);
  line(title);
  line('  ring  lat     E-W km  N-S km  height step   local slope | shading tilt, max (neighbour-to-neighbour jump), degrees');
  line('                                 (m, max)      (deg)       | terrain module        Three computeVertexNormals');
  const rings = [LAT - 1, LAT - 2, LAT - 3, LAT - 4, LAT - 8, 1, 2, 3, 4, 8, 100, 64];
  for (const r of rings) {
    const lat = 90 - (180 * r) / LAT;
    const ew = (2 * Math.PI * R_KM * Math.cos((lat * Math.PI) / 180)) / LON;
    const ns = (Math.PI * R_KM) / LAT;
    let step = 0;
    for (let c = 0; c < LON; c++) {
      step = Math.max(step, Math.abs((heights[r * COLS + ((c + 1) % LON)] as number) - (heights[r * COLS + c] as number)));
    }
    const slope = (Math.atan(step / (ew * 1000)) * 180) / Math.PI;
    const a = tilt(positions, analytic, r);
    const f = tilt(positions, faces, r);
    line(
      `  ${String(r).padStart(4)}  ${lat.toFixed(2).padStart(7)}  ${ew.toFixed(2).padStart(6)}  ${ns.toFixed(1).padStart(6)}  ` +
        `${step.toFixed(1).padStart(10)}  ${slope.toFixed(1).padStart(10)}   | ` +
        `${a.max.toFixed(1).padStart(5)} (${a.jump.toFixed(1).padStart(5)})          ${f.max.toFixed(1).padStart(5)} (${f.jump.toFixed(1).padStart(5)})`,
    );
  }
  line();
}

line(`File: ${path}  mesh ${LON} x ${LAT}   (rings 127..120 = south pole side, 1..8 = north pole side, 100 and 64 = reference)`);
line();
report('A. CURRENT rule (area average over a cell +-0.7 degrees in latitude AND longitude):', buildVertexHeights(raster, LON, LAT));
report('B. PROTOTYPE rule (same, but the footprint is as wide on the ground east-west as north-south):', buildVertexHeightsIsotropic(raster, LON, LAT));
line('How to read it: compare the rings next to the poles with ring 64 (equator) and ring 100.');
line('If A shows a big tilt jump at ring 127 that B removes, the spokes are a mesh-shape effect of the averaging cell.');
line('If A and B look alike and small, the spokes are NOT explained by heights or normals and the cause is elsewhere.');
