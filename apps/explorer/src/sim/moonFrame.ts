/**
 * APPROXIMATE Moon-fixed frame (accuracy level 4: simplified approximation).
 *
 * The validated Stage 2 module gives the Moon and Sun positions, but NOT a
 * validated Moon-fixed orientation. This file builds a simple, clearly
 * approximate one so the lunar globe can be lit consistently. It is NOT the
 * IAU/Mean-Earth frame and must never be used for site-level work.
 *
 * Construction (all vectors in EQJ):
 *   Z  = north pole of the J2000 mean ECLIPTIC.
 *        The real lunar spin axis is tilted about 1.54 degrees from it.
 *   E  = unit vector from the Moon's centre to the Earth's centre.
 *   X  = E with its Z component removed, normalised. This puts longitude 0 on
 *        the meridian facing the Earth's ecliptic longitude. It ASSUMES ZERO
 *        LONGITUDINAL LIBRATION; real optical libration moves the sub-Earth
 *        longitude by up to about 8 degrees either way.
 *   Y  = Z cross X: east (longitude +90). Seen from Earth with north up,
 *        east is to the RIGHT, matching the lunar map convention.
 *
 * What this gets right: the Sun's direction relative to the near side
 * (hence the phase pattern and the terminator's position) follows the real
 * Earth-Moon-Sun geometry. What it gets wrong: surface features are
 * displaced by up to about 8 degrees of longitude and about 1.5 degrees of
 * pole direction relative to the real Moon. Latitudinal libration is
 * included only through the Moon's ecliptic latitude (sub-Earth latitude
 * equals minus the Moon's ecliptic latitude), which omits the roughly
 * 1.5 degree contribution of the axis tilt.
 */
import { MEAN_OBLIQUITY_J2000_ARCSEC } from '../astro/constants.ts';
import { DEG2RAD, RAD2DEG } from '../astro/angles.ts';
import { cross, dot, mulMat3Vec3, norm, normalize, scale, sub, vec3 } from '../astro/vec3.ts';
import type { Mat3, Vec3 } from '../astro/vec3.ts';

const OBLIQUITY_RAD = (MEAN_OBLIQUITY_J2000_ARCSEC / 3600) * DEG2RAD;

/** North pole of the J2000 mean ecliptic, expressed in EQJ coordinates. */
export const ECLIPTIC_NORTH_EQJ: Vec3 = vec3(0, -Math.sin(OBLIQUITY_RAD), Math.cos(OBLIQUITY_RAD));

export const MOON_FRAME_MODEL_NAME = 'approximate: ecliptic pole, zero longitudinal libration';

export interface MoonFrame {
  /** Moon-fixed axes expressed in EQJ coordinates (each a unit vector). */
  readonly xEqj: Vec3;
  readonly yEqj: Vec3;
  readonly zEqj: Vec3;
  /** Rotation with v_moonfixed = M * v_eqj (rows are the three axes). */
  readonly eqjToMoonFixed: Mat3;
  /** Which orientation model built this frame (the approximate one below, or the IAU series in lunarOrientation.ts). */
  readonly model: string;
}

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

export interface MoonLighting {
  /** Unit vector from the Moon's centre toward the Sun, in the approximate Moon-fixed frame. */
  sunDirMoonFixed: Vec3;
  /** Unit vector from the Moon's centre toward the Earth, in the approximate Moon-fixed frame. */
  earthDirMoonFixed: Vec3;
  /** Point on the Moon where the Sun is at the zenith (approximate frame). */
  subSolar: LatLon;
  /** Point on the Moon where the Earth is at the zenith (approximate frame; longitude is 0 by construction). */
  subEarth: LatLon;
}

/**
 * Build the approximate frame from the Earth direction as seen from the Moon.
 * Returns null if the direction is (impossibly) parallel to the ecliptic pole.
 */
export function approximateMoonFrame(earthDirFromMoonEqj: Vec3): MoonFrame | null {
  const z = ECLIPTIC_NORTH_EQJ;
  const e = earthDirFromMoonEqj;
  if (!Number.isFinite(norm(e)) || norm(e) === 0) return null;
  const inPlane = sub(e, scale(z, dot(e, z)));
  if (norm(inPlane) < 1e-9 * norm(e)) return null;
  const x = normalize(inPlane);
  const y = cross(z, x);
  const eqjToMoonFixed: Mat3 = [
    [x.x, x.y, x.z],
    [y.x, y.y, y.z],
    [z.x, z.y, z.z],
  ];
  return { xEqj: x, yEqj: y, zEqj: z, eqjToMoonFixed, model: MOON_FRAME_MODEL_NAME };
}

/** Latitude (-90..90) and longitude (-180..180], degrees, of a direction in a body-fixed frame. */
export function directionToLatLon(v: Vec3): LatLon {
  const lonRaw = Math.atan2(v.y, v.x) * RAD2DEG;
  // Map -180 to +180 so the range is the half-open (-180, +180].
  const lonDeg = lonRaw <= -180 ? lonRaw + 360 : lonRaw;
  return { latDeg: Math.atan2(v.z, Math.hypot(v.x, v.y)) * RAD2DEG, lonDeg };
}

/**
 * Express the Sun and Earth directions (both from the Moon's centre, EQJ) in
 * the approximate Moon-fixed frame and locate the sub-solar and sub-Earth points.
 */
export function moonLighting(
  frame: MoonFrame,
  sunDirFromMoonEqj: Vec3,
  earthDirFromMoonEqj: Vec3,
): MoonLighting {
  const sun = normalize(mulMat3Vec3(frame.eqjToMoonFixed, sunDirFromMoonEqj));
  const earth = normalize(mulMat3Vec3(frame.eqjToMoonFixed, earthDirFromMoonEqj));
  return {
    sunDirMoonFixed: sun,
    earthDirMoonFixed: earth,
    subSolar: directionToLatLon(sun),
    subEarth: directionToLatLon(earth),
  };
}
