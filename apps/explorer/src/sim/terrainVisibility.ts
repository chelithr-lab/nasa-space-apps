/**
 * Terrain visibility: can direct sunlight reach a point on the Moon, given the terrain around it?
 *
 * This is a physical, three-dimensional test, written independently of the older horizon-profile code
 * in solarSite.ts (so the two can be compared). It never uses azimuth, so it is equally valid at the
 * poles, where azimuth and longitude are undefined and the Sun stays within about 1.6 degrees of the
 * horizon all year.
 *
 * GEOMETRY (all vectors Moon-fixed, kilometres; frame as in sceneMapping.ts)
 *   R      reference radius, 1737.4 km (heights are metres above this sphere)
 *   P      the observer: (R + ground + observer height) along the site's radial direction u
 *   d      unit vector from the Moon's centre toward the Sun. The Sun is 1.5e8 km away, so the
 *          direction from any point on the Moon differs from d by under 0.001 degree (ignored).
 *   ray    Q(s) = P + s d,  s >= 0 (straight line; light does not bend, the Moon has no atmosphere)
 *   e      Sun elevation, asin(d . u): angle above the plane tangent at the observer
 *
 * THE THREE (PLUS ONE) OUTCOMES
 *   geometric-darkness   the Sun's centre is below the observer's LOCAL horizon (e <= 0, the tangent
 *                        plane), and the Sun cannot be seen. Never called a terrain shadow.
 *   terrain-obstruction  the Sun is ABOVE the local horizon (e > 0) but the ray passes below the terrain
 *   direct-sunlight      the ray clears all terrain that was checked
 *   unknown              the terrain data needed to decide is missing (see "MISSING DATA")
 * One physical subtlety, handled exactly: a site high above its surroundings sees BELOW the tangent
 * plane. The smooth reference sphere's horizon lies `dip` = acos(R / |P|) below it (3.4 degrees for a
 * site 3 km up). For -dip < e <= 0 the ray-march decides: if the terrain falls away and nothing blocks
 * the ray, the Sun IS visible and the result is direct-sunlight with `belowLocalHorizon = true`; if it
 * is blocked, the result is geometric-darkness. For e <= -dip the Moon itself hides the Sun, with no
 * march. (The older horizon code used e > 0 and never reports the first case.)
 *
 * CURVATURE is not a correction term: positions are true 3D points, a ray's radius |Q(s)| =
 * sqrt(|P|^2 + 2 s P.d + s^2) is compared with the terrain surface radius R + h at the point
 * below it, so the surface falling away from the ray is built in.
 *
 * EXACT STOP. After s >= -P.d the ray's radius only increases. Once it exceeds R + (highest terrain
 * in the source) nothing further along the ray can touch the surface, so the march ends with no
 * arbitrary range limit. For a tangent ray this distance is about sqrt(2 R H) (about 190 km for
 * H = 10.7 km); for rays that start at the highest peak it is shorter.
 *
 * SAMPLING. A step of `stepFactor` (0.5) times the source's effectiveSpacingKm, so no feature the data
 * can represent falls between samples. Heights are bilinear between data points, which is smooth within a
 * cell, so a half-cell step cannot step over a cell-wide ridge (tested). Cost is about (stop
 * distance / step) samples: roughly 100-500 for the global raster, a few thousand for a 59 m source.
 *
 * ALONG-RAY DIAGNOSTICS. For every sample the terrain point S directly below the ray point is seen
 * from the observer at elevation angle alpha (measured in the vertical plane containing the Sun
 * direction). The largest alpha is the terrain horizon in the Sun's direction; margin = e - horizon.
 * The point that sets it is the "limiting feature": the terrain responsible for the result.
 * Blocked <=> margin <= 0 in exact arithmetic.
 *
 * SUN DISC. The centre decides the status (like the rest of the app). `discVisibleFraction` is the
 * share of the disc above the terrain horizon, treating that horizon as straight across the 0.53
 * degree disc (an approximation).
 *
 * MISSING DATA. null heights are counted. If the ray is blocked by terrain that IS known, the result
 * is terrain-obstruction regardless. Otherwise any missing sample makes the result `unknown`: absence
 * of data is never read as absence of terrain.
 *
 * NOT MODELLED: terrain smaller than the source resolution; the Sun as a disc with real limb
 * darkening; the 0.0007 degree parallax of the Sun from the Moon's surface; light reflected from
 * terrain. A single instant says nothing about PERMANENT shadow or illumination.
 */
import { RAD2DEG } from '../astro/angles.ts';
import { vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { latLonToUnit } from './sceneMapping.ts';
import { REFERENCE_RADIUS_KM } from './heightField.ts';
import type { HeightField } from './heightField.ts';

const R = REFERENCE_RADIUS_KM;
const KM_PER_AU = 149_597_870.7;
const SUN_RADIUS_KM = 695_700;

/** Mean angular radius of the Sun seen from the Earth-Moon system, degrees (959.63 arcsec). */
export const MEAN_SUN_ANGULAR_RADIUS_DEG = 959.63 / 3600;
export const DEFAULT_STEP_FACTOR = 0.5;
export const DEFAULT_MAX_SAMPLES = 20_000;

export function sunAngularRadiusDeg(distanceAu: number): number {
  return Math.asin(Math.min(1, SUN_RADIUS_KM / (distanceAu * KM_PER_AU))) * RAD2DEG;
}

export type VisibilityStatus = 'geometric-darkness' | 'terrain-obstruction' | 'direct-sunlight' | 'unknown';

export interface VisibilityOptions {
  /** Height of the observer (for example a panel) above the ground, metres. Default 0. */
  readonly observerHeightM?: number;
  /** Step as a fraction of the source's effective spacing. Default 0.5; larger values can miss narrow ridges. */
  readonly stepFactor?: number;
  readonly maxSamples?: number;
  readonly sunAngularRadiusDeg?: number;
}

export interface TerrainFeature {
  /** Straight-line distance from the observer, km. */
  readonly distanceKm: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Metres above the reference sphere. */
  readonly heightM: number;
  /** Elevation of this terrain point above the observer's tangent plane, degrees. */
  readonly elevationAngleDeg: number;
}

export interface VisibilityResult {
  readonly status: VisibilityStatus;
  /** One plain sentence saying why. */
  readonly reason: string;
  readonly observer: { readonly latDeg: number; readonly lonDeg: number; readonly groundHeightM: number | null; readonly observerHeightM: number };
  /** Sun-centre elevation above the observer's tangent plane, degrees. */
  readonly sunElevationDeg: number;
  /** The Sun's centre is at or below the tangent plane (it can still be visible from a summit; see the header). */
  readonly belowLocalHorizon: boolean;
  /** Depression of the smooth-sphere horizon below the tangent plane, degrees (>= 0). */
  readonly horizonDipDeg: number;
  /**
   * Highest elevation angle of the terrain under the ray, seen from the observer, over the part of the Sun's
   * vertical plane the ray covers before it clears all terrain. For a HIGH Sun that is only the nearby ground, so
   * this is NOT the full horizon; probe with a grazing Sun to get the whole reachable horizon. Null when no march was done.
   */
  readonly terrainHorizonDeg: number | null;
  /** Sun elevation minus the effective horizon (terrain or sphere, whichever is higher); null when no march was done. */
  readonly marginDeg: number | null;
  /** Fraction of the Sun's disc above the terrain horizon (see SUN DISC); null when unknown or not marched. */
  readonly discVisibleFraction: number | null;
  /** Distance along the ray to where it first enters terrain, km; null when it never does. */
  readonly firstBlockedKm: number | null;
  /** The terrain point that sets the horizon in the Sun's direction (the cause of an obstruction, or the closest call). */
  readonly limitingFeature: TerrainFeature | null;
  readonly source: { readonly id: string; readonly label: string; readonly effectiveSpacingKm: number; readonly revision: number };
  readonly sampling: {
    readonly stepKm: number;
    readonly samples: number;
    readonly missingSamples: number;
    readonly ended: 'not-marched' | 'clear-of-all-terrain' | 'sample-budget';
  };
  /** What this result cannot tell you. */
  readonly limitations: readonly string[];
}

function unit(v: Vec3): Vec3 | null {
  const n = Math.hypot(v.x, v.y, v.z);
  if (!(n > 1e-12) || !Number.isFinite(n)) return null;
  return vec3(v.x / n, v.y / n, v.z / n);
}

/** Share of a disc of radius 1 lying above a horizontal line `h` radii above its centre. */
export function discFractionAbove(h: number): number {
  if (h >= 1) return 0;
  if (h <= -1) return 1;
  return (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI;
}

function baseLimitations(field: HeightField, stepKm: number): string[] {
  const out = [
    `Terrain: ${field.label}, effective spacing ${field.effectiveSpacingKm.toFixed(3)} km. Features smaller than a few cells are not represented; the result must not be read as finer than this.`,
    'The Sun\'s centre decides the status; the fraction of its disc is an approximation that treats the horizon as straight.',
    'One instant only: this says nothing about permanent shadow or permanent illumination.',
  ];
  out.push(...field.provenance.notes);
  if (field.provenance.verticalAccuracyM === null) out.push('The vertical accuracy of this source is not known, so no uncertainty is attached to the margin.');
  void stepKm;
  return out;
}

export function terrainVisibility(
  field: HeightField,
  site: { readonly latDeg: number; readonly lonDeg: number },
  sunDirFixed: Vec3,
  options: VisibilityOptions = {},
): VisibilityResult {
  const { latDeg, lonDeg } = site;
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || Math.abs(latDeg) > 90) {
    throw new RangeError('The site needs a finite latitude (-90..90) and longitude.');
  }
  const d = unit(sunDirFixed);
  if (d === null) throw new RangeError('The Sun direction must be a finite, non-zero vector.');
  const observerHeightM = options.observerHeightM ?? 0;
  const stepFactor = options.stepFactor ?? DEFAULT_STEP_FACTOR;
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const sunRadiusDeg = options.sunAngularRadiusDeg ?? MEAN_SUN_ANGULAR_RADIUS_DEG;
  if (!(stepFactor > 0) || !(maxSamples >= 1) || !Number.isFinite(observerHeightM)) throw new RangeError('Invalid visibility options.');

  const stepKm = stepFactor * field.effectiveSpacingKm;
  const srcInfo = { id: field.id, label: field.label, effectiveSpacingKm: field.effectiveSpacingKm, revision: field.revision };
  const limitations = baseLimitations(field, stepKm);
  const none = { stepKm, samples: 0, missingSamples: 0, ended: 'not-marched' as const };

  const ground = field.heightMetres(latDeg, lonDeg);
  const observer = { latDeg, lonDeg, groundHeightM: ground, observerHeightM };
  const u = latLonToUnit(latDeg, lonDeg);
  const sinE = Math.min(1, Math.max(-1, d.x * u.x + d.y * u.y + d.z * u.z));
  const sunElevationDeg = Math.asin(sinE) * RAD2DEG;

  if (ground === null) {
    return {
      status: 'unknown', reason: `${field.label} has no data at this site, so its illumination cannot be determined.`,
      observer, sunElevationDeg, belowLocalHorizon: sunElevationDeg <= 0, horizonDipDeg: 0, terrainHorizonDeg: null, marginDeg: null, discVisibleFraction: null,
      firstBlockedKm: null, limitingFeature: null, source: srcInfo, sampling: none, limitations,
    };
  }

  const rP = R + (ground + observerHeightM) / 1000;
  const horizonDipDeg = rP > R ? Math.acos(R / rP) * RAD2DEG : 0;

  if (sunElevationDeg <= -horizonDipDeg) {
    return {
      status: 'geometric-darkness',
      reason: `The Sun's centre is ${(-horizonDipDeg - sunElevationDeg).toFixed(2)} degrees below the geometric horizon (the Moon itself is in the way).`,
      observer, sunElevationDeg, belowLocalHorizon: true, horizonDipDeg, terrainHorizonDeg: null, marginDeg: null, discVisibleFraction: null,
      firstBlockedKm: null, limitingFeature: null, source: srcInfo, sampling: none, limitations,
    };
  }

  // Unit vector toward the Sun's azimuth in the tangent plane (any perpendicular if the Sun is at the zenith).
  let hx = d.x - sinE * u.x;
  let hy = d.y - sinE * u.y;
  let hz = d.z - sinE * u.z;
  let hn = Math.hypot(hx, hy, hz);
  if (hn < 1e-9) {
    const a = Math.abs(u.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
    hx = a.y * u.z - a.z * u.y; hy = a.z * u.x - a.x * u.z; hz = a.x * u.y - a.y * u.x;
    hn = Math.hypot(hx, hy, hz);
  }
  hx /= hn; hy /= hn; hz /= hn;

  const Px = u.x * rP, Py = u.y * rP, Pz = u.z * rP;
  const Pd = rP * sinE;
  const rTop = R + field.maxHeightM / 1000;

  let samples = 0;
  let missing = 0;
  let alphaMax = -Infinity;
  let feature: TerrainFeature | null = null;
  let blockedPrevS = -1;
  let blockedS = -1;
  let ended: 'clear-of-all-terrain' | 'sample-budget' = 'sample-budget';

  for (let i = 1; i <= maxSamples; i++) {
    const s = i * stepKm;
    const Qx = Px + s * d.x, Qy = Py + s * d.y, Qz = Pz + s * d.z;
    const r = Math.sqrt(Qx * Qx + Qy * Qy + Qz * Qz);
    if (s + Pd >= 0 && r >= rTop) { ended = 'clear-of-all-terrain'; break; }
    samples = i;
    const qLat = Math.asin(Math.min(1, Math.max(-1, Qz / r))) * RAD2DEG;
    const qLon = Math.atan2(Qy, Qx) * RAD2DEG;
    const g = field.heightMetres(qLat, qLon);
    if (g === null) { missing++; continue; }
    const rs = R + g / 1000;
    if (r - rs <= 0 && blockedS < 0) { blockedS = s; blockedPrevS = s - stepKm; }
    const k = rs / r;
    const vx = Qx * k - Px, vy = Qy * k - Py, vz = Qz * k - Pz;
    const alpha = Math.atan2(vx * u.x + vy * u.y + vz * u.z, vx * hx + vy * hy + vz * hz) * RAD2DEG;
    if (alpha > alphaMax) {
      alphaMax = alpha;
      feature = { distanceKm: Math.hypot(vx, vy, vz), latDeg: qLat, lonDeg: qLon, heightM: g, elevationAngleDeg: alpha };
    }
  }

  // Refine where the ray first enters the terrain (bisection on the clearance; skipped if a sample is missing).
  let firstBlockedKm: number | null = null;
  if (blockedS >= 0) {
    let lo = Math.max(0, blockedPrevS);
    let hi = blockedS;
    for (let it = 0; it < 24; it++) {
      const mid = 0.5 * (lo + hi);
      const Qx = Px + mid * d.x, Qy = Py + mid * d.y, Qz = Pz + mid * d.z;
      const r = Math.sqrt(Qx * Qx + Qy * Qy + Qz * Qz);
      const g = field.heightMetres(Math.asin(Math.min(1, Math.max(-1, Qz / r))) * RAD2DEG, Math.atan2(Qy, Qx) * RAD2DEG);
      if (g === null) break;
      if (r - (R + g / 1000) <= 0) hi = mid; else lo = mid;
    }
    firstBlockedKm = hi;
  }

  const sampling = { stepKm, samples, missingSamples: missing, ended };
  const horizonDeg = Math.max(alphaMax, -horizonDipDeg);
  const terrainHorizonDeg = Number.isFinite(alphaMax) ? alphaMax : null;
  const marginDeg = sunElevationDeg - horizonDeg;
  const disc = discFractionAbove((horizonDeg - sunElevationDeg) / sunRadiusDeg);

  if (blockedS >= 0) {
    const f = feature;
    const below = sunElevationDeg <= 0;
    return {
      status: below ? 'geometric-darkness' : 'terrain-obstruction',
      reason: below
        ? `The Sun is ${(-sunElevationDeg).toFixed(2)} degrees below the local horizon and the ground blocks the line to it: darkness, not a terrain shadow.`
        : `Terrain ${firstBlockedKm === null ? '' : `${firstBlockedKm.toFixed(1)} km away `}rises above the line to the Sun (terrain horizon ${terrainHorizonDeg === null ? '?' : terrainHorizonDeg.toFixed(2)} degrees, Sun ${sunElevationDeg.toFixed(2)} degrees).`,
      observer, sunElevationDeg, belowLocalHorizon: below, horizonDipDeg, terrainHorizonDeg, marginDeg, discVisibleFraction: missing === 0 ? disc : null,
      firstBlockedKm, limitingFeature: f, source: srcInfo, sampling, limitations: missing > 0 ? [...limitations, `${missing} sample(s) had no terrain data; the obstruction itself is based on known terrain.`] : limitations,
    };
  }
  if (missing > 0 || ended === 'sample-budget') {
    return {
      status: 'unknown',
      reason: missing > 0
        ? `${missing} of ${samples} sample points along the line to the Sun have no terrain data in ${field.label}; absence of data is not read as absence of terrain.`
        : `The calculation reached its sample budget (${maxSamples}) before the line to the Sun was clear of all terrain.`,
      observer, sunElevationDeg, belowLocalHorizon: sunElevationDeg <= 0, horizonDipDeg, terrainHorizonDeg, marginDeg: null, discVisibleFraction: null,
      firstBlockedKm: null, limitingFeature: feature, source: srcInfo, sampling, limitations,
    };
  }
  return {
    status: 'direct-sunlight',
    reason: sunElevationDeg <= 0
      ? `The Sun is ${(-sunElevationDeg).toFixed(2)} degrees below the local horizontal plane but visible: the terrain falls away from this high site (horizon dip ${horizonDipDeg.toFixed(2)} degrees).`
      : `The line to the Sun clears all terrain by ${marginDeg.toFixed(2)} degrees.`,
    observer, sunElevationDeg, belowLocalHorizon: sunElevationDeg <= 0, horizonDipDeg, terrainHorizonDeg, marginDeg, discVisibleFraction: disc,
    firstBlockedKm: null, limitingFeature: feature, source: srcInfo, sampling, limitations,
  };
}

// ------------------------------------------------------------------------------------------ cache

/**
 * A small bounded cache (least recently used). The key contains everything that can change the answer:
 * the source id AND revision, the site, the observer height, the Sun direction to 1e-9, and the options.
 * A mutable source must bump `revision`, or this cache would return a stale answer.
 */
export class VisibilityCache {
  private readonly map = new Map<string, VisibilityResult>();
  hits = 0;
  misses = 0;

  private readonly capacity: number;

  constructor(capacity = 512) {
    if (!(capacity >= 1)) throw new RangeError('Cache capacity must be at least 1.');
    this.capacity = capacity;
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  private key(field: HeightField, site: { latDeg: number; lonDeg: number }, d: Vec3, o: VisibilityOptions): string {
    const q = (x: number): string => x.toFixed(9);
    return [field.id, field.revision, q(site.latDeg), q(site.lonDeg), q(d.x), q(d.y), q(d.z), o.observerHeightM ?? 0, o.stepFactor ?? DEFAULT_STEP_FACTOR, o.maxSamples ?? DEFAULT_MAX_SAMPLES, o.sunAngularRadiusDeg ?? MEAN_SUN_ANGULAR_RADIUS_DEG].join('|');
  }

  get(field: HeightField, site: { latDeg: number; lonDeg: number }, sunDirFixed: Vec3, options: VisibilityOptions = {}): VisibilityResult {
    const d = unit(sunDirFixed);
    if (d === null) return terrainVisibility(field, site, sunDirFixed, options); // throws the same RangeError
    const k = this.key(field, site, d, options);
    const hit = this.map.get(k);
    if (hit !== undefined) {
      this.hits++;
      this.map.delete(k);
      this.map.set(k, hit);
      return hit;
    }
    this.misses++;
    const result = terrainVisibility(field, site, d, options);
    this.map.set(k, result);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as string);
    return result;
  }
}

