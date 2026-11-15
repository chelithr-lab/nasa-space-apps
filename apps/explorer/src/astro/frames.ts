/**
 * Reference-frame helpers (pure maths).
 *
 * Frames used in this module (all right-handed, geocentric unless noted):
 *
 *  EQJ  Earth mean equator and equinox of J2000.0.
 *       x -> J2000 mean vernal equinox, z -> J2000 mean north celestial pole,
 *       y = z cross x. This is the frame Astronomy Engine documents for
 *       GeoMoon and GeoVector. (Its offset from ICRS is tens of
 *       milliarcseconds, ignored.)
 *
 *  ECLJ Mean ecliptic and equinox of J2000.0, obtained from EQJ by one fixed
 *       rotation about the x axis by the J2000 mean obliquity. Used only for
 *       the Sun-Moon ecliptic elongation (lunar phase angle convention).
 *
 *  EQD  True equator and equinox of date (includes precession and nutation).
 *
 *  EF   Earth-fixed: z -> rotation pole of date, x -> Greenwich meridian on
 *       the equator, y -> 90 degrees east. Reached from EQD by a rotation about
 *       z by Greenwich Apparent Sidereal Time. Polar motion is ignored.
 *
 * A camera looking down the +z axis of EQJ/EQD/EF is a "north-polar view".
 * That is a camera placement, not a different frame.
 */
import { DEG2RAD, RAD2DEG, normalizeDeg360, normalizeDegSigned180 } from './angles.ts';
import { MEAN_OBLIQUITY_J2000_ARCSEC } from './constants.ts';
import type { Vec3 } from './vec3.ts';

/** Rotate EQJ coordinates into the J2000 mean ecliptic frame (ECLJ). */
export function eqjToEclJ2000(v: Vec3): Vec3 {
  const eps = (MEAN_OBLIQUITY_J2000_ARCSEC / 3600) * DEG2RAD;
  const c = Math.cos(eps);
  const s = Math.sin(eps);
  return { x: v.x, y: c * v.y + s * v.z, z: -s * v.y + c * v.z };
}

/**
 * Ecliptic longitude in [0, 360) and latitude in [-90, +90], degrees,
 * of a vector that is ALREADY expressed in an ecliptic frame.
 */
export function eclipticLonLatDeg(v: Vec3): { lonDeg: number; latDeg: number } {
  return {
    lonDeg: normalizeDeg360(Math.atan2(v.y, v.x) * RAD2DEG),
    latDeg: Math.atan2(v.z, Math.hypot(v.x, v.y)) * RAD2DEG,
  };
}

/**
 * Geographic-style longitude in (-180, +180] (east positive) and GEOCENTRIC
 * latitude in [-90, +90], degrees, of a vector expressed in an Earth-fixed
 * frame. Geocentric latitude is the angle between the vector and the equator
 * plane; it differs from geodetic latitude by up to about 0.19 degrees.
 */
export function geographicLonLatDeg(v: Vec3): { lonDeg: number; latDeg: number } {
  return {
    lonDeg: normalizeDegSigned180(Math.atan2(v.y, v.x) * RAD2DEG),
    latDeg: Math.atan2(v.z, Math.hypot(v.x, v.y)) * RAD2DEG,
  };
}
