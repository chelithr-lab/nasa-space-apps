/**
 * Elevation colouring for the LOLA LDEM_16 raster (pure maths: no Three.js, no browser).
 *
 * WHAT A COLOUR MEANS
 *   A colour is a function of ONE number: the height of the LDEM_16 cell in metres above the
 *   1737.4 km reference sphere ((count - 20000) / 2, see lunarElevation.ts). Colours never come
 *   from imagery, lighting, slope or position. Height -> colour uses a fixed palette stretched
 *   linearly between two stated limits (the "display range"); heights outside the range take the
 *   end colours and are reported as CLIPPED in the legend. Nothing here changes a height.
 *
 * PALETTES
 *   'hypsometric': a designed blue-to-red hypsometric ramp (deep violet, blue, cyan, green, yellow,
 *      orange, red, white). Easy to read as low/middle/high, but it is a rainbow-type ramp: its
 *      lightness is not monotonic and it is not safe for every colour-vision type.
 *   'viridis': the matplotlib "viridis" colormap (Smith and van der Walt), sampled at 17 points
 *      (values read from matplotlib 3.11.2), perceptually uniform with monotonically increasing
 *      lightness and readable by most colour-blind viewers.
 *   Both are interpolated in Oklab (Ottosson 2020), so blends between stops are perceptually even.
 *   Colour boundaries are equal height steps. They have NO geological meaning.
 *
 * TEXTURE
 *   The raster is box-averaged to a smaller grid (mean of counts, so mean height) and coloured
 *   AFTER averaging, never the other way round. Baked rows run SOUTH to NORTH (row 0 = v 0 =
 *   south pole), matching sphereMesh.ts (v = (lat + 90) / 180) and an unflipped DataTexture.
 */
import { LDEM_UINT_OFFSET, LDEM_METRES_PER_COUNT, decodeHeightMetres } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';

export type PaletteId = 'hypsometric' | 'viridis';
export type RangeId = 'full' | 'contrast';
export type BandingId = 'smooth' | '1000';

export interface ElevationSettings {
  readonly palette: PaletteId;
  readonly range: RangeId;
  readonly banding: BandingId;
  /** Draw with the simulated Sun's lighting on top. Brightness then reflects sunlight too, NOT only height. */
  readonly sunShading: boolean;
}

export const DEFAULT_ELEVATION_SETTINGS: ElevationSettings = {
  palette: 'hypsometric',
  range: 'contrast',
  banding: 'smooth',
  sunShading: false,
};

export const PALETTE_LABEL: Readonly<Record<PaletteId, string>> = {
  hypsometric: 'Hypsometric (blue to red)',
  viridis: 'Viridis (perceptually uniform)',
};
export const RANGE_LABEL: Readonly<Record<RangeId, string>> = {
  full: 'Full data range',
  contrast: 'Contrast: 2nd\u201398th percentile',
};
export const BANDING_LABEL: Readonly<Record<BandingId, string>> = {
  smooth: 'Smooth',
  '1000': '1 km steps',
};
export const BAND_STEP_METRES: Readonly<Record<BandingId, number | null>> = { smooth: null, '1000': 1000 };

export const ELEVATION_TEXTURE_WIDTH = 4096;
export const ELEVATION_TEXTURE_HEIGHT = 2048;

// ---- colour maths -------------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

function hex(h: string): Rgb {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l: number): number => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.max(l, 0) ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(c * 255)));
};

export function srgbToOklab(rgb: Rgb): [number, number, number] {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToSrgb(lab: readonly [number, number, number]): [number, number, number] {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3;
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3;
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

interface Stop {
  readonly t: number;
  readonly rgb: Rgb;
}

const HYPSOMETRIC_STOPS: readonly Stop[] = (
  [
    [0.0, '#1a0b3d'], // deepest depressions: very deep violet
    [0.14, '#3a2a9b'],
    [0.28, '#2f6fd6'],
    [0.4, '#27b3d9'],
    [0.52, '#3cc47a'],
    [0.64, '#b6d947'],
    [0.76, '#f4d03f'],
    [0.86, '#f08a24'],
    [0.94, '#d7301f'],
    [1.0, '#ffffff'], // highest terrain: white
  ] as const
).map(([t, h]) => ({ t, rgb: hex(h) }));

/** matplotlib viridis at i/16, i = 0..16 (read from matplotlib 3.11.2). */
const VIRIDIS_HEX = [
  '#440154', '#48186a', '#472d7b', '#424086', '#3b528b', '#33638d', '#2c728e', '#26828e', '#21918c',
  '#1fa088', '#28ae80', '#3fbc73', '#5ec962', '#84d44b', '#addc30', '#d8e219', '#fde725',
] as const;
const VIRIDIS_STOPS: readonly Stop[] = VIRIDIS_HEX.map((h, i) => ({ t: i / 16, rgb: hex(h) }));

const STOPS: Readonly<Record<PaletteId, readonly Stop[]>> = { hypsometric: HYPSOMETRIC_STOPS, viridis: VIRIDIS_STOPS };

/** sRGB colour (0..255 each) at position t (0..1, clamped) on a palette. */
export function paletteColour(palette: PaletteId, t: number): [number, number, number] {
  const stops = STOPS[palette];
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  let i = 0;
  while (i < stops.length - 2 && x > (stops[i + 1]?.t ?? 1)) i++;
  const a = stops[i];
  const b = stops[i + 1];
  if (a === undefined || b === undefined) throw new Error('Palette has fewer than two stops.');
  const f = b.t === a.t ? 0 : (x - a.t) / (b.t - a.t);
  const la = srgbToOklab(a.rgb);
  const lb = srgbToOklab(b.rgb);
  return oklabToSrgb([la[0] + (lb[0] - la[0]) * f, la[1] + (lb[1] - la[1]) * f, la[2] + (lb[2] - la[2]) * f]);
}

// ---- statistics ---------------------------------------------------------------------------------

export interface ElevationStats {
  /** Lowest and highest LDEM_16 CELL MEAN in the raster, metres above the reference sphere. */
  readonly minMetres: number;
  readonly maxMetres: number;
  /** Area-weighted percentiles of cell-mean height, metres. */
  readonly p02Metres: number;
  readonly p98Metres: number;
  /** Area-weighted fraction of the surface in each of `histogram.length` equal-height bins between min and max. Sums to 1. */
  readonly histogram: readonly number[];
}

/**
 * Area-weighted statistics. A raster row spans a latitude band whose area is proportional to
 * sin(lat_top) - sin(lat_bottom), so polar rows (which are many pixels wide but little ground) do
 * not dominate. The weights are applied to heights of cell means, so the percentiles describe the
 * 1.9 km cell means, not individual points.
 */
export function computeElevationStats(raster: ElevationRaster, bins = 48): ElevationStats {
  const { width, height, counts } = raster;
  const weightByCount = new Float64Array(65536);
  let minC = 65535;
  let maxC = 0;
  for (let r = 0; r < height; r++) {
    const top = Math.sin(((90 - (r * 180) / height) * Math.PI) / 180);
    const bottom = Math.sin(((90 - ((r + 1) * 180) / height) * Math.PI) / 180);
    const w = top - bottom;
    const base = r * width;
    for (let c = 0; c < width; c++) {
      const v = counts[base + c] ?? 0;
      weightByCount[v] = (weightByCount[v] ?? 0) + w;
      if (v < minC) minC = v;
      if (v > maxC) maxC = v;
    }
  }
  let total = 0;
  for (let v = minC; v <= maxC; v++) total += weightByCount[v] ?? 0;
  const percentile = (p: number): number => {
    let acc = 0;
    for (let v = minC; v <= maxC; v++) {
      acc += weightByCount[v] ?? 0;
      if (acc >= p * total) return decodeHeightMetres(v);
    }
    return decodeHeightMetres(maxC);
  };
  const histogram = new Array<number>(bins).fill(0);
  const span = Math.max(1, maxC - minC + 1);
  for (let v = minC; v <= maxC; v++) {
    const bin = Math.min(bins - 1, Math.floor(((v - minC) / span) * bins));
    histogram[bin] = (histogram[bin] ?? 0) + (weightByCount[v] ?? 0) / total;
  }
  return {
    minMetres: decodeHeightMetres(minC),
    maxMetres: decodeHeightMetres(maxC),
    p02Metres: percentile(0.02),
    p98Metres: percentile(0.98),
    histogram,
  };
}

export interface DisplayRange {
  readonly loMetres: number;
  readonly hiMetres: number;
  /** True when some cells lie outside the range and are drawn with the end colour. */
  readonly clipsData: boolean;
}

/** Limits are rounded OUTWARD to 100 m so the legend shows clean numbers and nothing extra is clipped. */
export function displayRange(stats: ElevationStats, range: RangeId): DisplayRange {
  const lo = range === 'full' ? stats.minMetres : stats.p02Metres;
  const hi = range === 'full' ? stats.maxMetres : stats.p98Metres;
  const loMetres = Math.floor(lo / 100) * 100;
  const hiMetres = Math.max(loMetres + 100, Math.ceil(hi / 100) * 100);
  return { loMetres, hiMetres, clipsData: loMetres > stats.minMetres || hiMetres < stats.maxMetres };
}

// ---- height -> colour ---------------------------------------------------------------------------

/** 65,536-entry table: raw LDEM count -> packed RGBA. Built once per palette/range/banding. */
export function buildColourLut(settings: ElevationSettings, range: DisplayRange): Uint32Array {
  const bytes = new Uint8Array(65536 * 4);
  const table = new Array<[number, number, number]>(1024);
  for (let i = 0; i < 1024; i++) table[i] = paletteColour(settings.palette, i / 1023);
  const step = BAND_STEP_METRES[settings.banding];
  const span = range.hiMetres - range.loMetres;
  for (let count = 0; count < 65536; count++) {
    let h = (count - LDEM_UINT_OFFSET) * LDEM_METRES_PER_COUNT;
    if (step !== null) h = (Math.floor(h / step) + 0.5) * step;
    const t = Math.min(1, Math.max(0, (h - range.loMetres) / span));
    const rgb = table[Math.round(t * 1023)] ?? [0, 0, 0];
    bytes[count * 4] = rgb[0];
    bytes[count * 4 + 1] = rgb[1];
    bytes[count * 4 + 2] = rgb[2];
    bytes[count * 4 + 3] = 255;
  }
  return new Uint32Array(bytes.buffer);
}

/** Position of a height on the legend bar, 0..1, and whether it lies outside the range. */
export function legendPosition(heightMetres: number, range: DisplayRange): { fraction: number; clipped: 'below' | 'above' | null } {
  const raw = (heightMetres - range.loMetres) / (range.hiMetres - range.loMetres);
  return { fraction: Math.min(1, Math.max(0, raw)), clipped: raw < 0 ? 'below' : raw > 1 ? 'above' : null };
}

/** Tick heights (metres) at round numbers inside the range; at most `maxTicks`. */
export function legendTicks(range: DisplayRange, maxTicks = 5): number[] {
  const span = range.hiMetres - range.loMetres;
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const step = steps.find((s) => Math.floor(range.hiMetres / s) - Math.ceil(range.loMetres / s) + 1 <= maxTicks) ?? span;
  const ticks: number[] = [];
  for (let t = Math.ceil(range.loMetres / step) * step; t <= range.hiMetres + 1e-9; t += step) ticks.push(Math.round(t));
  return ticks;
}

/** "+4.5 km", "-2 km", "0 km" (true minus sign). Heights are rounded to 0.1 km. */
export function formatKm(metres: number): string {
  const km = Math.round(metres / 100) / 10;
  if (km === 0) return '0 km';
  return `${km < 0 ? '−' : '+'}${Math.abs(km).toString()} km`;
}

/** CSS gradient for the legend bar, built from the SAME lookup as the texture. */
export function legendGradientCss(settings: ElevationSettings, range: DisplayRange, stops = 48): string {
  const lut = buildColourLut(settings, range);
  const bytes = new Uint8Array(lut.buffer, lut.byteOffset, lut.byteLength);
  const parts: string[] = [];
  for (let i = 0; i < stops; i++) {
    const f = i / (stops - 1);
    const h = range.loMetres + f * (range.hiMetres - range.loMetres);
    const count = Math.min(65535, Math.max(0, Math.round(h / LDEM_METRES_PER_COUNT + LDEM_UINT_OFFSET)));
    parts.push(`rgb(${bytes[count * 4]},${bytes[count * 4 + 1]},${bytes[count * 4 + 2]}) ${(f * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

// ---- raster -> texture ---------------------------------------------------------------------------

/**
 * Box-average raw counts to dw x dh (north-first rows, same as the raster). Each output cell is the
 * overlap-weighted mean of the source cells it covers, so mean height is preserved. Rows are treated
 * as equal weight inside one output cell (the latitude difference across one cell is small).
 */
export function resampleMeanCounts(raster: ElevationRaster, dw: number, dh: number): Uint16Array {
  const { width: sw, height: sh, counts } = raster;
  if (!Number.isInteger(dw) || !Number.isInteger(dh) || dw < 1 || dh < 1) throw new RangeError('Output size must be whole numbers.');
  const xr = sw / dw;
  const yr = sh / dh;
  // Separable box filter (the 2-D box weight is the product of the two 1-D weights), so each source
  // row is averaged horizontally once and then reused by the output rows that overlap it.
  const colStart = new Int32Array(dw);
  let span = 1;
  for (let j = 0; j < dw; j++) {
    const c0 = Math.floor(j * xr);
    const c1 = Math.min(sw - 1, Math.ceil((j + 1) * xr) - 1);
    colStart[j] = c0;
    span = Math.max(span, c1 - c0 + 1);
  }
  const colWeights = new Float64Array(dw * span); // zero-padded, so every column loops the same `span` times
  for (let j = 0; j < dw; j++) {
    const a = j * xr;
    const b = (j + 1) * xr;
    const c0 = colStart[j] ?? 0;
    const c1 = Math.min(sw - 1, Math.ceil(b) - 1);
    for (let c = c0; c <= c1; c++) colWeights[j * span + (c - c0)] = (Math.min(b, c + 1) - Math.max(a, c)) / xr;
  }
  // Ring of recently averaged source rows: neighbouring output rows overlap by at most one source row.
  const ringSize = Math.ceil(yr) + 2;
  const ring: Float64Array[] = Array.from({ length: ringSize }, () => new Float64Array(dw));
  const ringRow = new Int32Array(ringSize).fill(-1);
  const last = sw - 1;
  const horizontal = (r: number): Float64Array => {
    const slot = r % ringSize;
    const row = ring[slot] as Float64Array;
    if (ringRow[slot] === r) return row;
    const base = r * sw;
    for (let j = 0; j < dw; j++) {
      const c0 = colStart[j] as number;
      const wb = j * span;
      let sum = 0;
      for (let k = 0; k < span; k++) {
        const c = c0 + k;
        sum += (counts[base + (c > last ? last : c)] as number) * (colWeights[wb + k] as number);
      }
      row[j] = sum;
    }
    ringRow[slot] = r;
    return row;
  };
  const out = new Uint16Array(dw * dh);
  for (let i = 0; i < dh; i++) {
    const ya = i * yr;
    const yb = (i + 1) * yr;
    const r0 = Math.floor(ya);
    const r1 = Math.min(sh - 1, Math.ceil(yb) - 1);
    const acc = new Float64Array(dw);
    for (let r = r0; r <= r1; r++) {
      const wy = (Math.min(yb, r + 1) - Math.max(ya, r)) / yr;
      const row = horizontal(r);
      for (let j = 0; j < dw; j++) acc[j] = (acc[j] ?? 0) + (row[j] ?? 0) * wy;
    }
    for (let j = 0; j < dw; j++) out[i * dw + j] = Math.round(acc[j] ?? 0);
  }
  return out;
}

/**
 * Colour the mean counts into RGBA bytes. `meanNorthFirst` rows run north to south; the output runs
 * SOUTH to NORTH (output row 0 = v 0 = south pole), ready for an unflipped DataTexture.
 */
export function bakeRgba(meanNorthFirst: Uint16Array, dw: number, dh: number, lut: Uint32Array, out: Uint8Array): void {
  if (meanNorthFirst.length !== dw * dh || out.length !== dw * dh * 4) throw new RangeError('Buffer sizes do not match.');
  const out32 = new Uint32Array(out.buffer, out.byteOffset, dw * dh);
  for (let t = 0; t < dh; t++) {
    const srcRow = (dh - 1 - t) * dw;
    const dstRow = t * dw;
    for (let j = 0; j < dw; j++) out32[dstRow + j] = lut[meanNorthFirst[srcRow + j] ?? 0] ?? 0;
  }
}

/** Plain-English description of the active scale, used by the legend and its tooltip. */
export function describeScale(settings: ElevationSettings, range: DisplayRange, stats: ElevationStats): string {
  const lo = formatKm(range.loMetres);
  const hi = formatKm(range.hiMetres);
  const clip = range.clipsData
    ? ` Cells lower than ${lo} or higher than ${hi} are clipped to the end colours (data runs ${formatKm(stats.minMetres)} to ${formatKm(stats.maxMetres)}).`
    : ' Nothing is clipped.';
  const band = settings.banding === 'smooth' ? '' : ' Heights are grouped into 1 km steps for readability.';
  return `Colours show LDEM_16 cell-mean height above the 1737.4 km reference sphere (not sea level), stretched linearly from ${lo} to ${hi}.${clip}${band} Colour boundaries are equal height steps, not geological units.`;
}
