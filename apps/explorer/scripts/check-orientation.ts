/**
 * Orientation check for the REAL elevation raster. Read-only: it changes nothing.
 *
 *   node scripts/check-orientation.ts
 *   node scripts/check-orientation.ts path\to\ldem_16_uint.raw
 *
 * Exit code: 0 = evidence consistent with the code's convention, 2 = inconclusive,
 *            1 = evidence contradicts the code (or the file is unusable).
 * Read docs/ORIENTATION_VERIFICATION.md for what "consistent" does and does not mean.
 */
import { readFileSync } from 'node:fs';
import { parseRawUint16LE } from '../src/sim/lunarElevation.ts';
import { HYPOTHESES, HYPOTHESIS_MEANING, checkOrientation } from '../src/sim/orientationCheck.ts';
import { CRATER_LANDMARKS, EXTREMUM_LANDMARKS } from '../src/sim/orientationLandmarks.ts';

const args = process.argv.slice(2);
const sizeFlag = args.indexOf('--size'); // test hook only: --size 1440x720
let width = 5760;
let height = 2880;
if (sizeFlag >= 0) {
  const [w, h] = (args[sizeFlag + 1] ?? '').split('x').map(Number);
  width = w ?? width;
  height = h ?? height;
  args.splice(sizeFlag, 2);
}
const path = args[0] ?? 'public/textures/ldem_16_uint.raw';

let buffer: ArrayBuffer;
try {
  const file = readFileSync(path);
  buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
} catch (error) {
  console.error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
let raster;
try {
  raster = parseRawUint16LE(buffer, width, height);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const f = (n: number, d = 2): string => n.toFixed(d);
const report = checkOrientation(raster);

console.log(`File: ${path}  (${width} x ${height})`);
console.log('');
console.log('1. EXTREME POINTS (raster pixel centres, code convention: row 0 north, column 0 at -180, east right)');
const ex = report.extrema;
const hi = EXTREMUM_LANDMARKS.find((e) => e.id === 'highest');
const lo = EXTREMUM_LANDMARKS.find((e) => e.id === 'lowest');
console.log(`   highest pixel: ${f(ex.highest.heightMetres, 1)} m at lat ${f(ex.highest.latDeg)}, lon ${f(ex.highest.lonDeg)}  (column ${ex.highest.column}, row ${ex.highest.row})`);
console.log(`      published : lat ${hi?.latDeg}, lon ${hi?.lonDeg}   [${hi?.tier}] ${hi?.source}`);
console.log(`   lowest pixel : ${f(ex.lowest.heightMetres, 1)} m at lat ${f(ex.lowest.latDeg)}, lon ${f(ex.lowest.lonDeg)}  (column ${ex.lowest.column}, row ${ex.lowest.row})`);
console.log(`      published : lat ${lo?.latDeg}, lon ${lo?.lonDeg}   [${lo?.tier}] ${lo?.source}`);
console.log('   misfit by hypothesis (degrees of arc, summed over both points; smaller is better):');
for (const h of HYPOTHESES) console.log(`      ${h.padEnd(15)} ${f(ex.misfitDeg[h]).padStart(8)}   ${HYPOTHESIS_MEANING[h]}`);
console.log(`   best fit: ${ex.best}; supports the code's convention: ${ex.supportsIdentity ? 'YES' : 'NO'}`);
console.log('');
console.log('2. CRATERS (rim-minus-floor contrast in metres, and standard deviations above the same parallel)');
console.log('   ' + 'landmark'.padEnd(14) + HYPOTHESES.map((h) => h.padStart(16)).join(''));
for (const c of report.craters.perCrater) {
  const cells = HYPOTHESES.map((h) => {
    const s = c.scores.find((x) => x.hypothesis === h);
    return `${f(s?.contrastMetres ?? 0, 0)}m z=${f(s?.z ?? 0, 1)}`.padStart(16);
  });
  console.log('   ' + `${c.landmark.name}`.padEnd(14) + cells.join(''));
}
console.log('   ' + 'TOTAL z'.padEnd(14) + HYPOTHESES.map((h) => f(report.craters.totalZ[h], 1).padStart(16)).join(''));
console.log(`   best fit: ${report.craters.best}; supports the code's convention: ${report.craters.supportsIdentity ? 'YES' : 'NO'}`);
for (const c of CRATER_LANDMARKS) console.log(`   [${c.tier}] ${c.name}: lat ${c.latDeg}, lon ${c.lonDeg}, ${c.diameterKm} km  ${c.source}`);
console.log('');
console.log(`VERDICT: ${report.verdict.toUpperCase()}${report.suspectedDefect !== null ? ` (suspected: ${report.suspectedDefect})` : ''}`);
console.log(report.statement);
console.log('COLOUR TEXTURE: UNRESOLVED by this script (compare on screen using the coordinate readout).');
console.log('');
console.log('LIMITS');
for (const l of report.limits) console.log(' - ' + l);
process.exit(report.verdict === 'consistent-with-code' ? 0 : report.verdict === 'inconclusive' ? 2 : 1);
