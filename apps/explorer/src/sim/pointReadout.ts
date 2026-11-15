/**
 * Latitude, longitude and height under the pointer (pure maths, no Three.js, no browser).
 *
 * COORDINATES: the point is a position in SCENE axes on the displaced surface. Terrain is displaced
 * RADIALLY, so the direction from the Moon's centre to the point is exactly the direction of the
 * latitude/longitude it came from. The conversion therefore uses only sceneMapping.ts
 * (fromScene = the inverse of toScene) and the same convention as latLonToUnit:
 * x_astro toward (0, 0), y_astro toward +90 E, z_astro north. No second coordinate system exists here.
 *
 * HEIGHT: sampled from the elevation raster at that latitude/longitude by bilinear interpolation
 * between pixel centres (sampleBilinearMetres). It is NOT read back from the drawn mesh, so it does
 * not depend on the exaggeration. The drawn mesh uses area-averaged vertex heights, so a readout
 * can differ a little from what the mesh shows near sharp relief; the readout is the traceable number.
 *
 * PRECISION: the source cells are 1/16 degree (about 1.9 km) means; their vertical accuracy is not
 * stated by the pages read. The readout therefore rounds height to 10 m and angles to 0.1 degree
 * (about 3 km), and says "interpolated".
 */
import { fromScene } from './sceneMapping.ts';
import { sampleBilinearMetres } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';
import { wrapLonDeg } from './orientationCheck.ts';

const RAD2DEG = 180 / Math.PI;
/** Closer to a pole than this (degrees of latitude) longitude is not meaningful. */
export const POLE_LONGITUDE_CUTOFF_DEG = 89.95;

export interface PointReadout {
  readonly latDeg: number;
  /** East-positive, -180..180 (+180 for the seam). null at a pole, where longitude is undefined. */
  readonly lonDeg: number | null;
  /** Metres above the 1737.4 km reference sphere, or null if the elevation data is not loaded. */
  readonly heightMetres: number | null;
}

export function sceneDirectionToLatLon(x: number, y: number, z: number): { latDeg: number; lonDeg: number | null } | null {
  if (![x, y, z].every(Number.isFinite)) return null;
  const a = fromScene({ x, y, z });
  const len = Math.hypot(a.x, a.y, a.z);
  if (!(len > 1e-12)) return null;
  const latDeg = Math.asin(Math.min(1, Math.max(-1, a.z / len))) * RAD2DEG;
  if (Math.abs(latDeg) >= POLE_LONGITUDE_CUTOFF_DEG) return { latDeg, lonDeg: null };
  return { latDeg, lonDeg: wrapLonDeg(Math.atan2(a.y, a.x) * RAD2DEG) };
}

/** null when the point is unusable (NaN, or at the centre). */
export function readoutAtScenePoint(x: number, y: number, z: number, raster: ElevationRaster | null): PointReadout | null {
  const ll = sceneDirectionToLatLon(x, y, z);
  if (ll === null) return null;
  // At a pole the height is the same for every longitude; 0 is used only to evaluate the sample.
  const heightMetres = raster === null ? null : sampleBilinearMetres(raster, ll.latDeg, ll.lonDeg ?? 0);
  return { latDeg: ll.latDeg, lonDeg: ll.lonDeg, heightMetres };
}

function fixed(value: number, digits: number): string {
  const s = Math.abs(value).toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s; // never "-0.0"
}

export interface ReadoutText {
  readonly position: string;
  readonly height: string;
  readonly title: string;
}

export const READOUT_PROMPT = 'Hover over the Moon for latitude, longitude and height.';

export function formatReadout(r: PointReadout, exaggeration: number): ReadoutText {
  const ns = fixed(r.latDeg, 1) === '0.0' ? '' : r.latDeg > 0 ? ' N' : ' S';
  const lat = `${fixed(r.latDeg, 1)}°${ns}`;
  let lon: string;
  if (r.lonDeg === null) lon = 'longitude undefined at the pole';
  else {
    const ew = r.lonDeg === 180 || fixed(r.lonDeg, 1) === '0.0' ? '' : r.lonDeg > 0 ? ' E' : ' W';
    lon = `${fixed(r.lonDeg, 1)}°${ew}`;
  }
  let height: string;
  if (r.heightMetres === null) height = 'height: terrain data not loaded';
  else {
    const rounded = Math.round(r.heightMetres / 10) * 10;
    const sign = rounded < 0 ? '−' : rounded > 0 ? '+' : '';
    height = `height ${sign}${Math.abs(rounded).toLocaleString('en-US')} m above the 1737.4 km reference sphere`;
  }
  const scale = r.heightMetres === null ? '' : exaggeration === 1 ? 'The drawn relief is at true scale.' : `The drawn relief is exaggerated ${exaggeration}x; this height is the real, un-exaggerated value.`;
  return {
    position: `${lat}, ${lon}`,
    height,
    title:
      'Latitude and longitude of the point under the pointer (east positive). Height is interpolated between the centres of ' +
      'NASA LRO LOLA LDEM_16 cells (about 1.9 km each; each cell is an area mean), rounded to 10 m. ' +
      'Heights are relative to a reference sphere, not sea level. ' + scale,
  };
}
