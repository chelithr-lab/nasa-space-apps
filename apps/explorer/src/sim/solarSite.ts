/**
 * Solar geometry for ONE selected lunar site. Pure functions, no rendering.
 *
 * Frames. Everything here is in the MOON-FIXED frame (X to 0N 0E, Y east, Z
 * north), the same one sceneMapping.ts maps into the scene with toScene().
 * A site is described by latitude, east-positive longitude and a height in
 * metres above the 1737.4 km reference sphere.
 *
 * What is modelled
 *   - Sun elevation and azimuth of the CENTRE of the Sun's disc, relative to the
 *     local horizontal plane (perpendicular to the radial "up" direction).
 *   - A terrain horizon from the LOLA raster: for 360 azimuths, the highest
 *     elevation angle of the surface within MAX_HORIZON_KM, with the Moon's
 *     curvature included exactly. The Sun is "blocked by terrain" when its
 *     centre is below that horizon.
 *   - Earth blocking the Sun (lunar eclipse), as two opaque discs seen from the site.
 *
 * What is NOT modelled (and the app says so)
 *   - Anything smaller than the raster: LDEM_16 cells are about 1.9 km area MEANS,
 *     so crater rims, boulders and slopes below about 4 km are smoothed or absent.
 *     Terrain nearer than one cell is ignored. Terrain beyond MAX_HORIZON_KM is ignored.
 *   - Permanently shadowed regions are NOT identified here; polar crater floors
 *     need much finer data than this raster.
 *   - The Sun's disc is treated as a point at its centre. Sunrise / sunset are
 *     the moments the CENTRE crosses the horizon; the disc (0.53 degrees across)
 *     takes about an hour to rise.
 *   - No refraction (the Moon has no atmosphere), no reflected light, no panel
 *     mounting height.
 */
import { DEG2RAD, RAD2DEG } from '../astro/angles.ts';
import { cross, dot, norm, normalize, scale, sub, vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { sampleBilinearMetres } from './lunarElevation.ts';
import type { ElevationRaster } from './lunarElevation.ts';
import { latLonToUnit } from './sceneMapping.ts';

export const MOON_RADIUS_KM = 1737.4;
/** IAU 2015 nominal solar radius (6.957e8 m), kilometres. */
export const SUN_RADIUS_KM = 695_700;
/** Mean Earth radius, kilometres. */
export const EARTH_RADIUS_KM = 6371;
/** Terrain farther than this from the site is ignored (relief would need to exceed ~18 km to matter beyond it). */
export const MAX_HORIZON_KM = 250;
export const HORIZON_AZIMUTH_BINS = 360;
/** Display bands for the condition label (NOT scientific classes). */
export const LOW_SUN_BELOW_DEG = 10;

export interface SiteFrame {
  readonly up: Vec3;
  readonly east: Vec3;
  readonly north: Vec3;
}

export function siteFrame(latDeg: number, lonDeg: number): SiteFrame {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  return {
    up: latLonToUnit(latDeg, lonDeg),
    east: vec3(-Math.sin(lon), Math.cos(lon), 0),
    north: vec3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)),
  };
}

export interface SunAltAz {
  /** Degrees above the local horizontal plane (negative below). */
  elevationDeg: number;
  /** Degrees clockwise from local north through east, [0, 360). */
  azimuthDeg: number;
}

export function sunAltAz(sunDirFixed: Vec3, frame: SiteFrame): SunAltAz {
  const s = normalize(sunDirFixed);
  const elevationDeg = Math.asin(Math.min(1, Math.max(-1, dot(s, frame.up)))) * RAD2DEG;
  const az = Math.atan2(dot(s, frame.east), dot(s, frame.north)) * RAD2DEG;
  return { elevationDeg, azimuthDeg: ((az % 360) + 360) % 360 };
}

// ---------------------------------------------------------------- terrain horizon

export interface HorizonProfile {
  /** False when no elevation raster was available: the horizon is then a plain sphere (0 degrees). */
  readonly terrainModelled: boolean;
  readonly azimuthStepDeg: number;
  /** Highest terrain elevation angle (degrees above the local horizontal) per azimuth bin, never below 0 (the sphere itself blocks rays below the local horizontal). */
  readonly anglesDeg: Float32Array;
  readonly maxDistanceKm: number;
  /** Distance between samples along a ray, kilometres (one raster cell). */
  readonly sampleSpacingKm: number;
}

export interface HorizonOptions {
  maxDistanceKm?: number;
}

export function sphereHorizon(): HorizonProfile {
  return {
    terrainModelled: false,
    azimuthStepDeg: 360 / HORIZON_AZIMUTH_BINS,
    anglesDeg: new Float32Array(HORIZON_AZIMUTH_BINS),
    maxDistanceKm: 0,
    sampleSpacingKm: 0,
  };
}

/**
 * Terrain horizon for a site. Cost: 360 x (maxDistance / cell) bilinear samples
 * (about 47,000 for the default); done ONCE when a site is selected.
 */
export function computeHorizonProfile(
  raster: ElevationRaster,
  latDeg: number,
  lonDeg: number,
  options: HorizonOptions = {},
): HorizonProfile {
  const maxKm = options.maxDistanceKm ?? MAX_HORIZON_KM;
  const frame = siteFrame(latDeg, lonDeg);
  const cellRad = (360 / raster.width) * DEG2RAD;
  const spacingKm = cellRad * MOON_RADIUS_KM;
  const steps = Math.max(1, Math.floor(maxKm / spacingKm));
  const h1 = sampleBilinearMetres(raster, latDeg, lonDeg) / 1000;
  const rP = MOON_RADIUS_KM + h1;
  const angles = new Float32Array(HORIZON_AZIMUTH_BINS);
  const stepDeg = 360 / HORIZON_AZIMUTH_BINS;
  const cosT: number[] = [];
  const sinT: number[] = [];
  for (let k = 1; k <= steps; k++) {
    cosT.push(Math.cos(k * cellRad));
    sinT.push(Math.sin(k * cellRad));
  }
  for (let b = 0; b < HORIZON_AZIMUTH_BINS; b++) {
    const az = b * stepDeg * DEG2RAD;
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    const tx = frame.north.x * ca + frame.east.x * sa;
    const ty = frame.north.y * ca + frame.east.y * sa;
    const tz = frame.north.z * ca + frame.east.z * sa;
    let best = 0; // the sphere itself is the floor
    for (let k = 0; k < steps; k++) {
      const c = cosT[k] as number;
      const s = sinT[k] as number;
      const dx = frame.up.x * c + tx * s;
      const dy = frame.up.y * c + ty * s;
      const dz = frame.up.z * c + tz * s;
      const lat = Math.asin(Math.min(1, Math.max(-1, dz))) * RAD2DEG;
      const lon = Math.atan2(dy, dx) * RAD2DEG;
      const rQ = MOON_RADIUS_KM + sampleBilinearMetres(raster, lat, lon) / 1000;
      const dist = Math.sqrt(rQ * rQ + rP * rP - 2 * rP * rQ * c);
      if (!(dist > 0)) continue;
      const elev = Math.asin(Math.min(1, Math.max(-1, (rQ * c - rP) / dist))) * RAD2DEG;
      if (elev > best) best = elev;
    }
    angles[b] = best;
  }
  return { terrainModelled: true, azimuthStepDeg: stepDeg, anglesDeg: angles, maxDistanceKm: steps * spacingKm, sampleSpacingKm: spacingKm };
}

/** Linear interpolation between azimuth bins (wraps at 360). */
export function horizonAngleAt(profile: HorizonProfile, azimuthDeg: number): number {
  const n = profile.anglesDeg.length;
  const x = ((((azimuthDeg % 360) + 360) % 360) / profile.azimuthStepDeg);
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const t = x - Math.floor(x);
  return (profile.anglesDeg[i0] as number) * (1 - t) + (profile.anglesDeg[i1] as number) * t;
}

// ------------------------------------------------------------- the site model

export interface SiteModel {
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Metres above the 1737.4 km reference sphere, or null when the elevation raster is not loaded. */
  readonly heightM: number | null;
  readonly frame: SiteFrame;
  readonly horizon: HorizonProfile;
  /** Unit normal of the terrain surface from the raster (about 4 km baseline), or null. */
  readonly terrainNormal: Vec3 | null;
  /** Slope of that surface, degrees from horizontal, or null. Regional scale only. */
  readonly regionalSlopeDeg: number | null;
}

/**
 * Surface normal and slope from the raster by central differences one cell
 * either side of the site (a baseline of two cells, about 3.8 km at the
 * equator). This is a REGIONAL slope; it says nothing about slopes at the
 * scale of a lander.
 */
export function regionalTerrainNormal(
  raster: ElevationRaster,
  latDeg: number,
  lonDeg: number,
): { normal: Vec3; slopeDeg: number } {
  const frame = siteFrame(latDeg, lonDeg);
  const cellDeg = 360 / raster.width;
  const cellKm = cellDeg * DEG2RAD * MOON_RADIUS_KM;
  const lat = Math.min(89.9, Math.max(-89.9, latDeg));
  const cosLat = Math.max(Math.cos(lat * DEG2RAD), 1e-3);
  const hE1 = sampleBilinearMetres(raster, lat, lonDeg + cellDeg / cosLat);
  const hW1 = sampleBilinearMetres(raster, lat, lonDeg - cellDeg / cosLat);
  const hN1 = sampleBilinearMetres(raster, Math.min(90, lat + cellDeg), lonDeg);
  const hS1 = sampleBilinearMetres(raster, Math.max(-90, lat - cellDeg), lonDeg);
  const baselineM = 2 * cellKm * 1000;
  const dzdE = (hE1 - hW1) / baselineM;
  const dzdN = (hN1 - hS1) / baselineM;
  const n = normalize(sub(sub(frame.up, scale(frame.east, dzdE)), scale(frame.north, dzdN)));
  const slopeDeg = Math.atan(Math.hypot(dzdE, dzdN)) * RAD2DEG;
  return { normal: n, slopeDeg };
}

export function buildSiteModel(raster: ElevationRaster | null, latDeg: number, lonDeg: number): SiteModel {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || Math.abs(latDeg) > 90) {
    throw new RangeError('A site needs a finite latitude (-90..90) and longitude.');
  }
  const frame = siteFrame(latDeg, lonDeg);
  if (raster === null) {
    return { latDeg, lonDeg, heightM: null, frame, horizon: sphereHorizon(), terrainNormal: null, regionalSlopeDeg: null };
  }
  const t = regionalTerrainNormal(raster, latDeg, lonDeg);
  return {
    latDeg,
    lonDeg,
    heightM: sampleBilinearMetres(raster, latDeg, lonDeg),
    frame,
    horizon: computeHorizonProfile(raster, latDeg, lonDeg),
    terrainNormal: t.normal,
    regionalSlopeDeg: t.slopeDeg,
  };
}

// ------------------------------------------------------------------- the Sun

/** Everything about the Sun (and Earth) at one instant, in the Moon-fixed frame. */
export interface SunSample {
  readonly utcMs: number;
  /** Unit vector Moon centre -> Sun, Moon-fixed. */
  readonly sunDirFixed: Vec3;
  /** Sun-Moon distance, astronomical units. */
  readonly sunDistanceAu: number;
  /** Moon centre -> Earth centre, kilometres, Moon-fixed; null if unknown (then eclipses are not evaluated). */
  readonly earthVecFixedKm: Vec3 | null;
}

/** Fraction (0..1) of the Sun's disc covered by two overlapping discs, angular radii in the same unit. */
export function discCoveredFraction(separation: number, coverRadius: number, sunRadius: number): number {
  const d = separation;
  const rc = coverRadius;
  const rs = sunRadius;
  if (!(rs > 0)) return 0;
  if (d >= rc + rs) return 0;
  if (d <= Math.abs(rc - rs)) return rc >= rs ? 1 : (rc * rc) / (rs * rs);
  const a1 = Math.acos(Math.min(1, Math.max(-1, (d * d + rc * rc - rs * rs) / (2 * d * rc))));
  const a2 = Math.acos(Math.min(1, Math.max(-1, (d * d + rs * rs - rc * rc) / (2 * d * rs))));
  const k = 0.5 * Math.sqrt(Math.max(0, (-d + rc + rs) * (d + rc - rs) * (d - rc + rs) * (d + rc + rs)));
  const area = rc * rc * a1 + rs * rs * a2 - k;
  return Math.min(1, Math.max(0, area / (Math.PI * rs * rs)));
}

/** Fraction of the Sun's disc hidden by the Earth as seen from the site (opaque disc; no atmosphere). */
export function earthCoveredFraction(site: SiteModel, sample: SunSample): number {
  if (sample.earthVecFixedKm === null) return 0;
  const rSite = MOON_RADIUS_KM + (site.heightM ?? 0) / 1000;
  const toEarth = sub(sample.earthVecFixedKm, scale(site.frame.up, rSite));
  const dist = norm(toEarth);
  if (!(dist > EARTH_RADIUS_KM)) return 0;
  const sep = Math.acos(Math.min(1, Math.max(-1, dot(normalize(toEarth), normalize(sample.sunDirFixed))))) * RAD2DEG;
  const rEarth = Math.asin(EARTH_RADIUS_KM / dist) * RAD2DEG;
  const rSun = Math.asin(Math.min(1, SUN_RADIUS_KM / (sample.sunDistanceAu * 149_597_870.7))) * RAD2DEG;
  return discCoveredFraction(sep, rEarth, rSun);
}

export type SolarCondition =
  | 'darkness'
  | 'terrain-shadow'
  | 'eclipse'
  | 'sunrise'
  | 'sunset'
  | 'low-sun'
  | 'high-sun';

export const CONDITION_LABEL: Readonly<Record<SolarCondition, string>> = {
  darkness: 'DARKNESS',
  'terrain-shadow': 'TERRAIN SHADOW',
  eclipse: 'ECLIPSE',
  sunrise: 'SUNRISE',
  sunset: 'SUNSET',
  'low-sun': 'LOW SUN',
  'high-sun': 'HIGH SUN',
};

export interface SiteSolarState {
  readonly utcMs: number;
  readonly sunDirFixed: Vec3;
  readonly sunDistanceAu: number;
  /** Centre of the Sun's disc, degrees above the local horizontal plane. */
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  /** The horizon the Sun must clear at this azimuth: terrain horizon, never below 0. */
  readonly horizonDeg: number;
  /** Sun centre above the geometric (spherical) horizon. */
  readonly geometricSunUp: boolean;
  /** Sun centre above the geometric horizon but below the terrain horizon. */
  readonly terrainBlocked: boolean;
  /** 0..1, share of the Sun's disc hidden by the Earth. */
  readonly eclipseCovered: number;
  /** Direct sunlight reaches the site: above the horizon, not blocked by terrain, not fully eclipsed. */
  readonly directSunlight: boolean;
  /** Angle between the Sun and the regional terrain normal, degrees, or null (no raster). */
  readonly terrainIncidenceDeg: number | null;
  readonly condition: SolarCondition;
}

/**
 * Evaluate the Sun at the site. `elevationRateDegPerHour` (optional) decides
 * between SUNRISE and SUNSET near the horizon; without it that band is shown as LOW SUN.
 */
export function evaluateSite(site: SiteModel, sample: SunSample, elevationRateDegPerHour: number | null = null): SiteSolarState {
  const { elevationDeg, azimuthDeg } = sunAltAz(sample.sunDirFixed, site.frame);
  const horizonDeg = Math.max(0, horizonAngleAt(site.horizon, azimuthDeg));
  const geometricSunUp = elevationDeg > 0;
  const terrainBlocked = geometricSunUp && elevationDeg <= horizonDeg;
  const eclipseCovered = geometricSunUp && !terrainBlocked ? earthCoveredFraction(site, sample) : 0;
  const directSunlight = geometricSunUp && !terrainBlocked && eclipseCovered < 1;

  const sunRadiusDeg = Math.asin(Math.min(1, SUN_RADIUS_KM / (sample.sunDistanceAu * 149_597_870.7))) * RAD2DEG;
  let condition: SolarCondition;
  if (!geometricSunUp) condition = 'darkness';
  else if (terrainBlocked) condition = 'terrain-shadow';
  else if (eclipseCovered >= 1) condition = 'eclipse';
  else if (elevationDeg - horizonDeg < sunRadiusDeg && elevationRateDegPerHour !== null) {
    condition = elevationRateDegPerHour >= 0 ? 'sunrise' : 'sunset';
  } else if (elevationDeg < LOW_SUN_BELOW_DEG) condition = 'low-sun';
  else condition = 'high-sun';

  const terrainIncidenceDeg =
    site.terrainNormal === null
      ? null
      : Math.acos(Math.min(1, Math.max(-1, dot(normalize(sample.sunDirFixed), site.terrainNormal)))) * RAD2DEG;

  return {
    utcMs: sample.utcMs,
    sunDirFixed: sample.sunDirFixed,
    sunDistanceAu: sample.sunDistanceAu,
    elevationDeg,
    azimuthDeg,
    horizonDeg,
    geometricSunUp,
    terrainBlocked,
    eclipseCovered,
    directSunlight,
    terrainIncidenceDeg,
    condition,
  };
}

/** Unit vector helper used by tests and the sky plot: direction of (azimuth, elevation) in the site frame. */
export function directionFromAltAz(frame: SiteFrame, elevationDeg: number, azimuthDeg: number): Vec3 {
  const e = elevationDeg * DEG2RAD;
  const a = azimuthDeg * DEG2RAD;
  const h = Math.cos(e);
  const d = vec3(0, 0, 0);
  const north = scale(frame.north, h * Math.cos(a));
  const east = scale(frame.east, h * Math.sin(a));
  const up = scale(frame.up, Math.sin(e));
  return vec3(d.x + north.x + east.x + up.x, d.y + north.y + east.y + up.y, d.z + north.z + east.z + up.z);
}

/** Orthonormality check used by tests. */
export function frameIsOrthonormal(f: SiteFrame, tolerance = 1e-9): boolean {
  const c = cross(f.east, f.north);
  return (
    Math.abs(norm(f.up) - 1) < tolerance &&
    Math.abs(norm(f.east) - 1) < tolerance &&
    Math.abs(norm(f.north) - 1) < tolerance &&
    Math.abs(dot(f.up, f.east)) < tolerance &&
    Math.abs(dot(f.up, f.north)) < tolerance &&
    Math.abs(dot(c, f.up) - 1) < tolerance
  );
}
