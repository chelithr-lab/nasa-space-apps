/**
 * Orientation checker for the elevation raster (pure maths, no Three.js, no browser).
 *
 * It answers one question: does the raster follow the convention the code assumes
 * (row 0 = north, column 0 starts at longitude -180, east to the right) or one of four
 * alternatives (east-west mirror, north-south flip, 180 degree shift, mirror + flip)?
 *
 * Two independent kinds of evidence are combined, and the report keeps them separate:
 *   1. EXTREMA: where the raster's highest and lowest pixels are, against published locations.
 *   2. CRATERS: for named craters, how strongly "rim higher than floor" holds at the published
 *      position, ranked against the same measurement at every longitude on that parallel.
 *
 * "Evidence" is never "proof" (see ORIENTATION_LIMITS). The checker can answer 'inconclusive'.
 */
import { columnCentreLonDeg, rowCentreLatDeg, sampleBilinearMetres } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';
import { CRATER_LANDMARKS, EXTREMUM_LANDMARKS, ORIENTATION_LIMITS } from './orientationLandmarks.ts';
import type { CraterLandmark } from './orientationLandmarks.ts';

export const MOON_RADIUS_KM = 1737.4;
const DEG = Math.PI / 180;

export type Hypothesis = 'identity' | 'eastWestMirror' | 'northSouthFlip' | 'shift180' | 'mirrorAndFlip';
export const HYPOTHESES: readonly Hypothesis[] = ['identity', 'eastWestMirror', 'northSouthFlip', 'shift180', 'mirrorAndFlip'];

export const HYPOTHESIS_MEANING: Readonly<Record<Hypothesis, string>> = {
  identity: 'raster follows the code: row 0 north, column 0 at -180, east to the right',
  eastWestMirror: 'raster is mirrored east-west (longitude sign reversed)',
  northSouthFlip: 'raster is flipped north-south (row 0 is the SOUTH edge)',
  shift180: 'raster starts at longitude 0 instead of -180 (shifted by 180 degrees)',
  mirrorAndFlip: 'raster is both mirrored and flipped (rotated 180 degrees in the image plane)',
};

export interface LatLon {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export function wrapLonDeg(lonDeg: number): number {
  const w = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** Where a feature whose TRUE position is p would appear in the raster if the raster has defect h. */
export function appearsAt(h: Hypothesis, p: LatLon): LatLon {
  switch (h) {
    case 'identity':
      return p;
    case 'eastWestMirror':
      return { latDeg: p.latDeg, lonDeg: wrapLonDeg(-p.lonDeg) };
    case 'northSouthFlip':
      return { latDeg: -p.latDeg, lonDeg: p.lonDeg };
    case 'shift180':
      return { latDeg: p.latDeg, lonDeg: wrapLonDeg(p.lonDeg + 180) };
    case 'mirrorAndFlip':
      return { latDeg: -p.latDeg, lonDeg: wrapLonDeg(-p.lonDeg) };
  }
}

/** A new raster that has defect h (used by tests to make known-wrong rasters). */
export function withDefect(raster: ElevationRaster, h: Hypothesis): ElevationRaster {
  const w = raster.width;
  const ht = raster.height;
  const out = new Uint16Array(raster.counts.length);
  for (let r = 0; r < ht; r++) {
    for (let c = 0; c < w; c++) {
      let sr = r;
      let sc = c;
      if (h === 'eastWestMirror' || h === 'mirrorAndFlip') sc = w - 1 - c;
      if (h === 'northSouthFlip' || h === 'mirrorAndFlip') sr = ht - 1 - r;
      if (h === 'shift180') sc = (c + w / 2) % w;
      out[r * w + c] = raster.counts[sr * w + sc] ?? 0;
    }
  }
  return { width: w, height: ht, counts: out };
}

export function angularDistanceDeg(a: LatLon, b: LatLon): number {
  const la = a.latDeg * DEG;
  const lb = b.latDeg * DEG;
  const dl = (a.lonDeg - b.lonDeg) * DEG;
  const c = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dl);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/** Point reached from p by travelling `angleRad` along `bearingRad` (great circle). */
export function destination(p: LatLon, bearingRad: number, angleRad: number): LatLon {
  const lat1 = p.latDeg * DEG;
  const lon1 = p.lonDeg * DEG;
  const sinLat2 = Math.sin(lat1) * Math.cos(angleRad) + Math.cos(lat1) * Math.sin(angleRad) * Math.cos(bearingRad);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(bearingRad) * Math.sin(angleRad) * Math.cos(lat1), Math.cos(angleRad) - Math.sin(lat1) * Math.sin(lat2));
  return { latDeg: lat2 / DEG, lonDeg: wrapLonDeg(lon2 / DEG) };
}

// ---- 1. extrema -----------------------------------------------------------------------------

export interface PixelExtremum {
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly heightMetres: number;
  readonly column: number;
  readonly row: number;
}

export function findExtrema(raster: ElevationRaster): { lowest: PixelExtremum; highest: PixelExtremum } {
  let minV = Infinity;
  let maxV = -Infinity;
  let minI = 0;
  let maxI = 0;
  const n = raster.counts.length;
  for (let i = 0; i < n; i++) {
    const v = raster.counts[i] ?? 0;
    if (v < minV) { minV = v; minI = i; }
    if (v > maxV) { maxV = v; maxI = i; }
  }
  const at = (i: number, v: number): PixelExtremum => {
    const row = Math.floor(i / raster.width);
    const column = i % raster.width;
    return { latDeg: rowCentreLatDeg(raster, row), lonDeg: columnCentreLonDeg(raster, column), heightMetres: (v - 20000) / 2, column, row };
  };
  return { lowest: at(minI, minV), highest: at(maxI, maxV) };
}

export interface ExtremaEvidence {
  readonly lowest: PixelExtremum;
  readonly highest: PixelExtremum;
  /** For each hypothesis: the summed arc distance (degrees) between where the published extrema would appear and where the raster's extrema are. */
  readonly misfitDeg: Readonly<Record<Hypothesis, number>>;
  readonly best: Hypothesis;
  /** True when the identity hypothesis fits within tolerance and every alternative is at least 5 degrees worse per point. */
  readonly supportsIdentity: boolean;
}

export function checkExtrema(raster: ElevationRaster): ExtremaEvidence {
  const { lowest, highest } = findExtrema(raster);
  const hi = EXTREMUM_LANDMARKS.find((e) => e.id === 'highest');
  const lo = EXTREMUM_LANDMARKS.find((e) => e.id === 'lowest');
  if (hi === undefined || lo === undefined) throw new Error('Extremum landmarks are missing.');
  const misfit = {} as Record<Hypothesis, number>;
  for (const h of HYPOTHESES) {
    misfit[h] =
      angularDistanceDeg(appearsAt(h, hi), highest) + angularDistanceDeg(appearsAt(h, lo), lowest);
  }
  let best: Hypothesis = 'identity';
  for (const h of HYPOTHESES) if (misfit[h] < misfit[best]) best = h;
  const tol = hi.toleranceDeg + lo.toleranceDeg;
  const others = HYPOTHESES.filter((h) => h !== 'identity');
  const supportsIdentity = best === 'identity' && misfit.identity <= tol && others.every((h) => misfit[h] - misfit.identity >= 10);
  return { lowest, highest, misfitDeg: misfit, best, supportsIdentity };
}

// ---- 2. craters -----------------------------------------------------------------------------

const BEARINGS = 24;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/**
 * Rim-minus-floor contrast in metres: median height on rings at 0.9, 1.0 and 1.1 crater radii
 * minus median height inside 0.4 radius. Positive for a bowl with a raised rim. Crater diameters
 * are taken from the landmark list; the raster is sampled bilinearly.
 */
export function craterContrastMetres(raster: ElevationRaster, centre: LatLon, diameterKm: number): number {
  const radiusRad = diameterKm / 2 / MOON_RADIUS_KM;
  const floor: number[] = [sampleBilinearMetres(raster, centre.latDeg, centre.lonDeg)];
  const rim: number[] = [];
  for (let k = 0; k < BEARINGS; k++) {
    const b = (k / BEARINGS) * 2 * Math.PI;
    for (const f of [0.2, 0.4]) {
      const p = destination(centre, b, radiusRad * f);
      floor.push(sampleBilinearMetres(raster, p.latDeg, p.lonDeg));
    }
    for (const f of [0.9, 1.0, 1.1]) {
      const p = destination(centre, b, radiusRad * f);
      rim.push(sampleBilinearMetres(raster, p.latDeg, p.lonDeg));
    }
  }
  return median(rim) - median(floor);
}

export interface Background {
  readonly mean: number;
  readonly std: number;
  readonly samples: number;
}

/** Contrast at every `stepDeg` of longitude along the parallel of `latDeg`. */
export function parallelBackground(raster: ElevationRaster, latDeg: number, diameterKm: number, stepDeg = 3): Background {
  const values: number[] = [];
  for (let lon = -180; lon < 180; lon += stepDeg) values.push(craterContrastMetres(raster, { latDeg, lonDeg: lon }, diameterKm));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return { mean, std: Math.sqrt(variance), samples: values.length };
}

export interface CraterHypothesisScore {
  readonly hypothesis: Hypothesis;
  readonly sampledAt: LatLon;
  readonly contrastMetres: number;
  /** Standard deviations above the mean contrast along the same parallel. */
  readonly z: number;
}

export interface CraterEvidence {
  readonly landmark: CraterLandmark;
  readonly scores: readonly CraterHypothesisScore[];
}

export interface CraterSummary {
  readonly perCrater: readonly CraterEvidence[];
  readonly totalZ: Readonly<Record<Hypothesis, number>>;
  readonly best: Hypothesis;
  /** Identity best by at least 3 summed standard deviations over every alternative, and positive in each crater. */
  readonly supportsIdentity: boolean;
}

export function checkCraters(raster: ElevationRaster, landmarks: readonly CraterLandmark[] = CRATER_LANDMARKS): CraterSummary {
  const totalZ = Object.fromEntries(HYPOTHESES.map((h) => [h, 0])) as Record<Hypothesis, number>;
  const perCrater: CraterEvidence[] = [];
  for (const lm of landmarks) {
    const scores: CraterHypothesisScore[] = [];
    for (const h of HYPOTHESES) {
      const at = appearsAt(h, lm);
      const c = craterContrastMetres(raster, at, lm.diameterKm);
      const bg = parallelBackground(raster, at.latDeg, lm.diameterKm);
      const z = bg.std > 0 ? (c - bg.mean) / bg.std : 0;
      scores.push({ hypothesis: h, sampledAt: at, contrastMetres: c, z });
      totalZ[h] += z;
    }
    perCrater.push({ landmark: lm, scores });
  }
  let best: Hypothesis = 'identity';
  for (const h of HYPOTHESES) if (totalZ[h] > totalZ[best]) best = h;
  const margin = HYPOTHESES.filter((h) => h !== 'identity').every((h) => totalZ.identity - totalZ[h] >= 3);
  const eachPositive = perCrater.every((p) => (p.scores.find((s) => s.hypothesis === 'identity')?.z ?? 0) > 1);
  return { perCrater, totalZ, best, supportsIdentity: best === 'identity' && margin && eachPositive };
}

// ---- combined report -------------------------------------------------------------------------

export type Verdict = 'consistent-with-code' | 'contradicts-code' | 'inconclusive';

export interface OrientationReport {
  readonly extrema: ExtremaEvidence;
  readonly craters: CraterSummary;
  readonly verdict: Verdict;
  /** Which defect the evidence points to when it contradicts the code (null otherwise). */
  readonly suspectedDefect: Hypothesis | null;
  readonly colourTexture: 'unresolved';
  readonly statement: string;
  readonly limits: readonly string[];
}

export function checkOrientation(raster: ElevationRaster): OrientationReport {
  const extrema = checkExtrema(raster);
  const craters = checkCraters(raster);
  let verdict: Verdict;
  let suspected: Hypothesis | null = null;
  if (extrema.supportsIdentity && craters.supportsIdentity) {
    verdict = 'consistent-with-code';
  } else if (extrema.best !== 'identity' && extrema.best === craters.best && !extrema.supportsIdentity) {
    verdict = 'contradicts-code';
    suspected = extrema.best;
  } else {
    verdict = 'inconclusive';
  }
  const statement =
    verdict === 'consistent-with-code'
      ? 'Both the extreme points and the named craters are where the code assumes they are. This is evidence that the ELEVATION raster follows the code’s convention. It is not proof (see limits), and it says nothing about the colour texture.'
      : verdict === 'contradicts-code'
        ? `Both kinds of evidence point the same way: ${HYPOTHESIS_MEANING[extrema.best]}. Do not present the terrain as geographically correct until this is resolved.`
        : 'The evidence does not settle the orientation (the two kinds of evidence disagree, or a margin was too small). Treat orientation as UNVERIFIED.';
  return { extrema, craters, verdict, suspectedDefect: suspected, colourTexture: 'unresolved', statement, limits: ORIENTATION_LIMITS };
}
