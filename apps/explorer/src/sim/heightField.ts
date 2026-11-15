/**
 * A source of lunar surface heights, independent of how the data is stored.
 *
 * The terrain-visibility engine (terrainVisibility.ts) only ever sees this interface, so the global
 * LOLA raster used today, a regional SLDEM2015 tile or a local LROC NAC DTM can be added later
 * without touching the scientific code.
 *
 * CONVENTIONS (the app's, unchanged)
 *   - Heights are METRES above the 1737.4 km reference sphere. Not sea level; the Moon has none.
 *   - Geographic coordinates are latitude (north +) and longitude (EAST +, -180..180) in degrees.
 *   - The Moon-fixed Cartesian frame has X to (0 N, 0 E), Y east (lon +90), Z north. The scene
 *     mapping (x, z, -y) is applied only at the rendering boundary (sceneMapping.ts); nothing here
 *     knows about it, and nothing here knows about visual terrain exaggeration.
 *
 * HONESTY
 *   - `heightMetres` returns null where the source has no data (outside its coverage, or a no-data
 *     cell). It never invents a value, and callers must treat null as "unknown".
 *   - `effectiveSpacingKm` is the spacing that describes the INFORMATION in the data, which can
 *     differ from the pixel pitch. Results must not claim finer detail than this.
 */
import { DEG2RAD, RAD2DEG } from '../astro/angles.ts';
import { vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { latLonToUnit } from './sceneMapping.ts';
import { decodeHeightMetres, sampleBilinearMetres } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';

/** Mean lunar radius of the reference sphere, kilometres (the same 1737.4 km used everywhere in the app). */
export const REFERENCE_RADIUS_KM = 1737.4;

export interface GeoBounds {
  readonly latMinDeg: number;
  readonly latMaxDeg: number;
  /** East-positive, -180..180. A source that crosses the antimeridian is not supported yet. */
  readonly lonMinDeg: number;
  readonly lonMaxDeg: number;
}

export const WHOLE_MOON: GeoBounds = { latMinDeg: -90, latMaxDeg: 90, lonMinDeg: -180, lonMaxDeg: 180 };

export interface TerrainProvenance {
  /** Producer, for example "NASA LRO LOLA". */
  readonly producer: string;
  /** Product name, for example "LDEM_16". */
  readonly product: string;
  readonly horizontalReference: string;
  readonly verticalReference: string;
  /** Published vertical accuracy in metres, or null when it is not known. Never guessed. */
  readonly verticalAccuracyM: number | null;
  readonly citation: string | null;
  /** Caveats a user should see next to any result derived from this source. */
  readonly notes: readonly string[];
}

export interface HeightField {
  /** Stable identifier of the source ("lola-ldem16-global"). */
  readonly id: string;
  readonly label: string;
  /**
   * Changes whenever the data this object returns could change. Caches include it in their keys, so
   * a mutable source MUST increment it on every change (a stale cache is a wrong answer).
   */
  readonly revision: number;
  /** Spacing, in km, that describes the information in the data (see the HONESTY note above). */
  readonly effectiveSpacingKm: number;
  readonly bounds: GeoBounds;
  /** Highest height this source can return, metres. Used to stop a ray exactly, so it must not be too low. */
  readonly maxHeightM: number;
  /** Lowest height this source can return, metres. */
  readonly minHeightM: number;
  readonly provenance: TerrainProvenance;
  /** Height in metres above the reference sphere at a point, or null if there is no data there. */
  heightMetres(latDeg: number, lonDeg: number): number | null;
}

// ------------------------------------------------------------------ coordinate transformations

/** Moon-fixed position, kilometres, of a point at `heightM` metres above the reference sphere. */
export function geoToMoonFixedKm(latDeg: number, lonDeg: number, heightM: number): Vec3 {
  const u = latLonToUnit(latDeg, lonDeg);
  const r = REFERENCE_RADIUS_KM + heightM / 1000;
  return vec3(u.x * r, u.y * r, u.z * r);
}

/**
 * Inverse of geoToMoonFixedKm. Longitude is returned in -180..180; at a pole (x and y both ~0) it
 * is undefined and 0 is returned (the height field is continuous there, so it does not matter).
 */
export function moonFixedKmToGeo(p: Vec3): { latDeg: number; lonDeg: number; heightM: number } {
  const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
  const latDeg = Math.asin(Math.min(1, Math.max(-1, p.z / r))) * RAD2DEG;
  const lonDeg = Math.hypot(p.x, p.y) < 1e-9 * r ? 0 : Math.atan2(p.y, p.x) * RAD2DEG;
  return { latDeg, lonDeg, heightM: (r - REFERENCE_RADIUS_KM) * 1000 };
}

export function boundsContain(b: GeoBounds, latDeg: number, lonDeg: number): boolean {
  return latDeg >= b.latMinDeg && latDeg <= b.latMaxDeg && lonDeg >= b.lonMinDeg && lonDeg <= b.lonMaxDeg;
}

/** Kilometres per degree of arc on the reference sphere. */
export const KM_PER_DEGREE = REFERENCE_RADIUS_KM * DEG2RAD;

// ------------------------------------------------------------------ the global LOLA raster

export const LOLA_GLOBAL_PROVENANCE: TerrainProvenance = {
  producer: 'NASA LRO LOLA (via NASA SVS CGI Moon Kit)',
  product: 'LDEM_16 (16 pixels per degree), height = (count - 20000) / 2 metres',
  horizontalReference: 'Simple cylindrical, 5760 x 2880, row 0 north, column 0 at longitude -180 (orientation check: consistent with the code)',
  verticalReference: 'Sphere of radius 1737.4 km (not sea level)',
  verticalAccuracyM: null,
  citation: null,
  notes: [
    'Each cell is an area mean of about 1.9 km: craters, rims and ridges smaller than a few cells are smoothed or absent.',
    'No vertical accuracy for these cells was found in the sources read, so none is stated.',
  ],
};

/**
 * The existing global LOLA raster as a HeightField. Heights come straight from the raster in true
 * metres (exaggeration is a rendering choice and never reaches this code). The raster has no
 * no-data cells, so this source never returns null.
 */
export function rasterHeightField(raster: ElevationRaster, options: { id?: string; label?: string; revision?: number } = {}): HeightField {
  let min = Infinity;
  let max = -Infinity;
  const counts = raster.counts;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i] as number;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  return {
    id: options.id ?? 'lola-ldem16-global',
    label: options.label ?? 'Global LOLA (LDEM_16)',
    revision: options.revision ?? 0,
    effectiveSpacingKm: (360 / raster.width) * KM_PER_DEGREE,
    bounds: WHOLE_MOON,
    maxHeightM: decodeHeightMetres(max),
    minHeightM: decodeHeightMetres(min),
    provenance: LOLA_GLOBAL_PROVENANCE,
    heightMetres: (latDeg, lonDeg) => sampleBilinearMetres(raster, latDeg, lonDeg),
  };
}

// ------------------------------------------------------------------ synthetic terrain (tests, demos)

export interface FunctionFieldOptions {
  readonly id: string;
  readonly effectiveSpacingKm: number;
  /** Must bound the function from above (the engine stops rays with it). */
  readonly maxHeightM: number;
  readonly minHeightM: number;
  /** Return null for "no data". */
  readonly fn: (latDeg: number, lonDeg: number) => number | null;
  readonly bounds?: GeoBounds;
  readonly revision?: number;
}

/** A height field defined by a function. Provenance says plainly that it is synthetic. */
export function functionHeightField(o: FunctionFieldOptions): HeightField {
  return {
    id: o.id,
    label: `Synthetic terrain (${o.id})`,
    revision: o.revision ?? 0,
    effectiveSpacingKm: o.effectiveSpacingKm,
    bounds: o.bounds ?? WHOLE_MOON,
    maxHeightM: o.maxHeightM,
    minHeightM: o.minHeightM,
    provenance: {
      producer: 'synthetic',
      product: 'analytic test terrain',
      horizontalReference: 'latitude / east longitude',
      verticalReference: 'sphere of radius 1737.4 km',
      verticalAccuracyM: 0,
      citation: null,
      notes: ['Not lunar data.'],
    },
    heightMetres: o.fn,
  };
}
