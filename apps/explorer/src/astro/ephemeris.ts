/**
 * The boundary between this application and any astronomy library.
 *
 * Types only (no runtime code). The one real implementation is
 * ephemeris-astronomy-engine.ts. Tests use a clearly labelled SYNTHETIC
 * implementation (testSupport.ts) to check the wiring and the maths without
 * the library; synthetic data is never used to claim astronomical accuracy.
 *
 * Contract for every implementation:
 *  - `utcMs` is UTC milliseconds since 1970-01-01T00:00:00Z. Implementations
 *    must never read the computer's clock.
 *  - Vectors are geocentric (origin = centre of the Earth), frame EQJ, in
 *    astronomical units (AU).
 */
import type { Vec3 } from './vec3.ts';

export interface LibrationRaw {
  /** Library field `elon`: sub-Earth libration, ecliptic-longitude angle, degrees. Sign convention UNVERIFIED. */
  elonDeg: number;
  /** Library field `elat`: sub-Earth libration, ecliptic-latitude angle, degrees. Sign convention UNVERIFIED. */
  elatDeg: number;
  /** Library field `mlon`: Moon's geocentric ecliptic longitude, degrees (equinox convention per library). */
  moonEclLonDeg: number;
  /** Library field `mlat`: Moon's geocentric ecliptic latitude, degrees. */
  moonEclLatDeg: number;
  /** Library field `dist_km`: Earth-centre to Moon-centre distance, km. */
  distKm: number;
  /** Library field `diam_deg`: apparent diameter from the Earth's centre, degrees. */
  apparentDiameterDeg: number;
}

export type EarthRotationRaw =
  | {
      ok: true;
      /** Greenwich Apparent Sidereal Time in sidereal hours. */
      gastHours: number;
      /**
       * The images of the three EQJ unit axes (x, y, z), each expressed in
       * EQD (true equator and equinox of date) coordinates. Supplying the
       * three axes avoids any ambiguity about matrix storage order.
       */
      eqjAxesInEqd: readonly [Vec3, Vec3, Vec3];
    }
  | { ok: false; reason: string };

export interface EphemerisSnapshot {
  /** TT - UT in seconds used by the library at this instant. */
  deltaTSeconds: number;
  /** Earth centre to Moon centre, EQJ, AU. */
  moonGeoEqjAu: Vec3;
  /** Earth centre to Sun centre, EQJ, AU. */
  sunGeoEqjAu: Vec3;
  libration: LibrationRaw;
  /** The library's own Sun-Moon ecliptic elongation, degrees [0,360). Used only as a cross-check. */
  libraryMoonPhaseDeg: number;
  /** The library's own phase angle and illuminated fraction. Used only as a cross-check. */
  libraryIllumination: { phaseAngleDeg: number; fraction: number };
  earthRotation: EarthRotationRaw;
}

/** quarter: 0 = New Moon, 1 = First Quarter, 2 = Full Moon, 3 = Last (Third) Quarter. */
export interface MoonQuarterEvent {
  quarter: 0 | 1 | 2 | 3;
  utcMs: number;
}

export interface Ephemeris {
  readonly name: string;
  snapshot(utcMs: number): EphemerisSnapshot;
  /** The next `count` principal phases strictly after `startUtcMs`. */
  moonQuarters(startUtcMs: number, count: number): MoonQuarterEvent[];
}
