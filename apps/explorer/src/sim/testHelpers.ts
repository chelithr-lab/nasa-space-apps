/**
 * Helpers for tests only (not used by the app).
 * Builds geocentric EQJ vectors from ecliptic longitude/latitude, so tests can
 * pose the Moon and Sun at chosen elongations without an ephemeris.
 */
import { MEAN_OBLIQUITY_J2000_ARCSEC } from '../astro/constants.ts';
import { DEG2RAD } from '../astro/angles.ts';
import type { Vec3 } from '../astro/vec3.ts';

/** Ecliptic (J2000 mean) lon/lat in degrees and distance -> EQJ vector. */
export function eclipticToEqj(lonDeg: number, latDeg: number, distance: number): Vec3 {
  const lon = lonDeg * DEG2RAD;
  const lat = latDeg * DEG2RAD;
  const eps = (MEAN_OBLIQUITY_J2000_ARCSEC / 3600) * DEG2RAD;
  const xe = distance * Math.cos(lat) * Math.cos(lon);
  const ye = distance * Math.cos(lat) * Math.sin(lon);
  const ze = distance * Math.sin(lat);
  return { x: xe, y: Math.cos(eps) * ye - Math.sin(eps) * ze, z: Math.sin(eps) * ye + Math.cos(eps) * ze };
}

export const EARTH_MOON_KM = 384400;
export const EARTH_SUN_KM = 149597870.7;
