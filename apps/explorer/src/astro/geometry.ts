/**
 * Earth-Moon-Sun geometry from geocentric position vectors (pure maths).
 *
 * Inputs are vectors from the CENTRE OF THE EARTH, in kilometres, in one
 * common frame (EQJ in this application). Nothing here reads a clock.
 *
 * Two different "phase" ideas, kept apart on purpose:
 *
 *  1. APPARENT PHASE seen from Earth: how much of the Moon's visible disk is
 *     lit. It depends on the phase angle i (the Sun-Moon-Earth angle at the
 *     Moon):  fraction = (1 + cos i) / 2.
 *  2. LIT FRACTION OF THE WHOLE GLOBE: at any time the Sun lights one
 *     hemisphere, i.e. about half of the lunar surface, whatever the phase
 *     looks like from Earth. It is not computed here because it is constant.
 */
import { normalizeDeg360 } from './angles.ts';
import { eclipticLonLatDeg, eqjToEclJ2000 } from './frames.ts';
import { angleBetweenDeg, norm, scale, sub } from './vec3.ts';
import type { Vec3 } from './vec3.ts';

export const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

/** Illuminated fraction of the visible disk, 0..1, from phase angle i in degrees. */
export function diskIlluminatedFractionFromPhaseAngleDeg(phaseAngleDeg: number): number {
  return (1 + Math.cos((phaseAngleDeg * Math.PI) / 180)) / 2;
}

export interface TriangleGeometry {
  /** Earth centre to Moon centre, km. */
  earthMoonKm: number;
  /** Earth centre to Sun centre, km. */
  earthSunKm: number;
  /** Moon centre to Sun centre, km. */
  moonSunKm: number;
  /** Angle at EARTH between the Moon and the Sun, degrees, 0..180. */
  elongationDeg: number;
  /** Angle at the MOON between the Sun and the Earth, degrees, 0..180. */
  phaseAngleDeg: number;
  /** Angle at the SUN between the Earth and the Moon, degrees (tiny, < ~0.16). */
  angleAtSunDeg: number;
  /** Lit fraction of the Moon's disk as seen from Earth, 0..1. */
  diskIlluminatedFraction: number;
}

/**
 * Solve the Earth-Moon-Sun triangle. The three angles sum to 180 degrees
 * (checked by the unit tests).
 */
export function triangleGeometry(moonGeoKm: Vec3, sunGeoKm: Vec3): TriangleGeometry {
  const moonToSun = sub(sunGeoKm, moonGeoKm);
  const moonToEarth = scale(moonGeoKm, -1);
  const sunToEarth = scale(sunGeoKm, -1);
  const sunToMoon = sub(moonGeoKm, sunGeoKm);

  const elongationDeg = angleBetweenDeg(moonGeoKm, sunGeoKm);
  const phaseAngleDeg = angleBetweenDeg(moonToSun, moonToEarth);
  const angleAtSunDeg = angleBetweenDeg(sunToEarth, sunToMoon);

  return {
    earthMoonKm: norm(moonGeoKm),
    earthSunKm: norm(sunGeoKm),
    moonSunKm: norm(moonToSun),
    elongationDeg,
    phaseAngleDeg,
    angleAtSunDeg,
    diskIlluminatedFraction: diskIlluminatedFractionFromPhaseAngleDeg(phaseAngleDeg),
  };
}

/**
 * Ecliptic elongation of the Moon east of the Sun, degrees in [0, 360):
 * Moon ecliptic longitude minus Sun ecliptic longitude, both in the J2000
 * mean ecliptic. 0 = New, 90 = First Quarter, 180 = Full, 270 = Last Quarter.
 * This is the same convention as Astronomy Engine's MoonPhase().
 * (Longitude DIFFERENCES are almost unaffected by the choice of equinox, so
 * using the J2000 ecliptic instead of the ecliptic of date is a negligible
 * approximation.)
 */
export function eclipticElongationDeg(moonGeoEqj: Vec3, sunGeoEqj: Vec3): number {
  const moon = eclipticLonLatDeg(eqjToEclJ2000(moonGeoEqj));
  const sun = eclipticLonLatDeg(eqjToEclJ2000(sunGeoEqj));
  return normalizeDeg360(moon.lonDeg - sun.lonDeg);
}

/**
 * Display convention for the eight principal phase names: eight sectors of
 * 45 degrees, each CENTRED on 0, 45, 90, ... 315 degrees of ecliptic
 * elongation. A sector includes its lower edge and excludes its upper edge,
 * so exactly 22.5 degrees is "Waxing Crescent". This is a naming convention,
 * not an astronomical definition. The exact instants of New, First Quarter,
 * Full and Last Quarter come from the ephemeris (see nextMoonQuarters).
 */
export function phaseIndexFromEclipticElongation(elongationDeg: number): number {
  const e = normalizeDeg360(elongationDeg);
  return Math.floor((e + 22.5) / 45) % 8;
}

export function phaseNameFromEclipticElongation(elongationDeg: number): PhaseName {
  const index = phaseIndexFromEclipticElongation(elongationDeg);
  const name = PHASE_NAMES[index];
  if (name === undefined) {
    throw new RangeError('Phase index out of range.');
  }
  return name;
}

/** Waxing = the Moon is in the first half of the cycle (elongation 0..180, 180 excluded). */
export function isWaxing(elongationDeg: number): boolean {
  return normalizeDeg360(elongationDeg) < 180;
}
