/**
 * Lunar body-fixed orientation from the IAU rotational elements (the series
 * used by the IAU Working Group on Cartographic Coordinates and Rotational
 * Elements, Archinal et al. 2011 / 2018, "Moon" section).
 *
 * WHY THIS FILE EXISTS. moonFrame.ts builds a deliberately simple Moon-fixed
 * frame (ecliptic pole, ZERO longitudinal libration) and says it "must never be
 * used for site-level work". It puts the Sun about 8 degrees of longitude (about
 * 16 hours of sunrise time) and about 1.5 degrees of pole direction away from
 * the real geometry. Sunrise, sunset and polar illumination at a selected
 * site need better, so this file gives the standard IAU orientation.
 *
 * What this is: the IAU series (pole direction alpha0/delta0 and prime-meridian
 * angle W as functions of days since J2000 TDB, with 13 periodic terms for
 * libration). What it is NOT: the DE-ephemeris physical libration (which is
 * the source of the series), or the Mean-Earth versus Principal-Axis offset of
 * about 0.02 degrees (under 1 km on the surface), which is ignored here.
 *
 * Convention: body-fixed X points to selenographic (0 N, 0 E); Z is the north
 * pole; Y completes the right-handed set and points EAST (longitude +90). This
 * is the same convention as the rest of the app (see sceneMapping.ts).
 *
 * Coefficient source (read 2026-11-01): the IAU 2009 report / Archinal et al.
 * 2011 tables, as reproduced in the open-source `arika` library (rotation.rs);
 * they agree with the values the author knew independently. See
 * docs/SOLAR_INTELLIGENCE.md.
 */
import { DEG2RAD, RAD2DEG } from '../astro/angles.ts';
import { dot, mulMat3, normalize, vec3 } from '../astro/vec3.ts';
import type { Mat3, Vec3 } from '../astro/vec3.ts';
import { directionToLatLon } from './moonFrame.ts';
import type { LatLon, MoonFrame } from './moonFrame.ts';

export const J2000_TT_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const IAU_MOON_FRAME_MODEL_NAME = 'IAU Moon rotational elements (series with libration terms)';

/** Argument table: [constantDeg, rateDegPerDay]. */
const E: ReadonlyArray<readonly [number, number]> = [
  [125.045, -0.0529921],
  [250.089, -0.1059842],
  [260.008, 13.0120009],
  [176.625, 13.3407154],
  [357.529, 0.9856003],
  [311.589, 26.4057084],
  [134.963, 13.064993],
  [276.617, 0.3287146],
  [34.226, 1.7484877],
  [15.134, -0.1589763],
  [119.743, 0.0036096],
  [239.961, 0.1643573],
  [25.053, 12.9590088],
];

/** [argument number 1..13, coefficient (degrees)] */
const ALPHA_SIN: ReadonlyArray<readonly [number, number]> = [
  [1, -3.8787], [2, -0.1204], [3, 0.07], [4, -0.0172], [6, 0.0072], [10, -0.0052], [13, 0.0043],
];
const DELTA_COS: ReadonlyArray<readonly [number, number]> = [
  [1, 1.5419], [2, 0.0239], [3, -0.0278], [4, 0.0068], [6, -0.0029], [7, 0.0009], [10, 0.0008], [13, -0.0009],
];
const W_SIN: ReadonlyArray<readonly [number, number]> = [
  [1, 3.561], [2, 0.1208], [3, -0.0642], [4, 0.0158], [5, 0.0252], [6, -0.0066], [7, -0.0047],
  [8, -0.0046], [9, 0.0028], [10, 0.0052], [11, 0.004], [12, 0.0019], [13, -0.0044],
];

export interface LunarRotationElements {
  /** Right ascension of the north pole, degrees (ICRF/EQJ). */
  alpha0Deg: number;
  /** Declination of the north pole, degrees. */
  delta0Deg: number;
  /** Prime-meridian angle, degrees (not reduced). */
  wDeg: number;
}

/** Days since J2000.0 on the TT scale (TDB differs by under 2 ms, which is irrelevant here). */
export function daysSinceJ2000Tt(utcMs: number, deltaTSeconds: number): number {
  return (utcMs + deltaTSeconds * 1000 - J2000_TT_UTC_MS) / 86_400_000;
}

export function lunarRotationElements(daysSinceJ2000: number): LunarRotationElements {
  const d = daysSinceJ2000;
  const t = d / 36525;
  const arg = (n: number): number => {
    const e = E[n - 1];
    if (e === undefined) throw new RangeError(`No argument E${n}.`);
    return (e[0] + e[1] * d) * DEG2RAD;
  };
  let alpha = 269.9949 + 0.0031 * t;
  for (const [n, c] of ALPHA_SIN) alpha += c * Math.sin(arg(n));
  let delta = 66.5392 + 0.013 * t;
  for (const [n, c] of DELTA_COS) delta += c * Math.cos(arg(n));
  let w = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d;
  for (const [n, c] of W_SIN) w += c * Math.sin(arg(n));
  return { alpha0Deg: alpha, delta0Deg: delta, wDeg: w };
}

function rotZ(angleDeg: number): Mat3 {
  const c = Math.cos(angleDeg * DEG2RAD);
  const s = Math.sin(angleDeg * DEG2RAD);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
}

function rotX(angleDeg: number): Mat3 {
  const c = Math.cos(angleDeg * DEG2RAD);
  const s = Math.sin(angleDeg * DEG2RAD);
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c],
  ];
}

/**
 * Rotation taking EQJ (J2000 equatorial) vectors to Moon-fixed vectors:
 * v_fixed = Rz(W) Rx(90 - delta0) Rz(90 + alpha0) v_eqj  (passive rotations).
 * EQJ and ICRF differ by about 0.02 arcsec, which is ignored.
 */
export function eqjToLunarFixed(daysSinceJ2000: number): Mat3 {
  const el = lunarRotationElements(daysSinceJ2000);
  return mulMat3(mulMat3(rotZ(el.wDeg), rotX(90 - el.delta0Deg)), rotZ(90 + el.alpha0Deg));
}

/** A MoonFrame (same shape the rest of the app uses) built from the IAU elements. */
export function iauMoonFrame(utcMs: number, deltaTSeconds: number): MoonFrame {
  const m = eqjToLunarFixed(daysSinceJ2000Tt(utcMs, deltaTSeconds));
  return {
    xEqj: vec3(m[0][0], m[0][1], m[0][2]),
    yEqj: vec3(m[1][0], m[1][1], m[1][2]),
    zEqj: vec3(m[2][0], m[2][1], m[2][2]),
    eqjToMoonFixed: m,
    model: IAU_MOON_FRAME_MODEL_NAME,
  };
}

/** Selenographic latitude and east-positive longitude of a Moon-fixed direction. */
export function fixedDirectionToLatLon(v: Vec3): LatLon {
  return directionToLatLon(normalize(v));
}

/**
 * The libration-in-longitude / latitude of the Earth direction, i.e. the
 * selenographic position of the sub-Earth point, from a Moon-fixed Earth direction.
 */
export function subEarthPoint(earthDirMoonFixed: Vec3): LatLon {
  return fixedDirectionToLatLon(earthDirMoonFixed);
}

/** Angle between two unit vectors, degrees (clamped). */
export function separationDeg(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(normalize(a), normalize(b))))) * RAD2DEG;
}
