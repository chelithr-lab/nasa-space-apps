/**
 * TEST SUPPORT ONLY (not imported by the app).
 *
 * An INDEPENDENT low-precision Sun (Meeus, Astronomical Algorithms, chapter 25,
 * about 0.01 degree) so the lunar-orientation and solar-geometry tests do not
 * depend on astronomy-engine (which is not installed in every test environment)
 * and are not circular with it.
 */
import { eclipticToEqj } from './testHelpers.ts';
import type { Vec3 } from '../astro/vec3.ts';

export const KM_PER_AU_TEST = 149597870.7;

/** Geocentric Sun, EQJ, as a unit vector plus the distance in AU. Light-time shift applied (no aberration), like the app. */
export function meeusSunEqj(utcMs: number): { dir: Vec3; distanceAu: number } {
  const jd = utcMs / 86_400_000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const rad = Math.PI / 180;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * rad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * rad) +
    0.000289 * Math.sin(3 * M * rad);
  const trueLonOfDate = L0 + C;
  const nu = M + C;
  const distanceAu = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu * rad));
  // light-time shift (-0.00569 deg), then remove general precession to refer to the J2000 ecliptic
  const lonJ2000 = trueLonOfDate - 0.00569 - (1.396971 * T + 0.0003086 * T * T);
  const v = eclipticToEqj(((lonJ2000 % 360) + 360) % 360, 0, 1);
  return { dir: v, distanceAu };
}
