/**
 * The shared astronomical state for ONE explicit UTC instant.
 *
 * Both 3D views must read from this object. Nothing here reads the computer's
 * clock: the caller always passes the simulation time. Changing a camera never
 * changes this state.
 *
 * Units: kilometres for lengths, degrees for angles, unless a field name says
 * otherwise. Vectors are geocentric, frame EQJ (see frames.ts), unless named
 * "fromMoon" (origin = centre of the Moon, axes still EQJ-parallel).
 */
import { SUPPORTED_RANGE, formatUtc, isInSupportedRange } from '../core/time.ts';
import type { Result } from '../core/time.ts';
import { ACCURACY } from './accuracy.ts';
import type { AccuracyNote } from './accuracy.ts';
import { signedAngleDiffDeg } from './angles.ts';
import { KM_PER_AU, MOON_REFERENCE_RADIUS_KM, REFERENCE_SPAN } from './constants.ts';
import type { Ephemeris, EphemerisSnapshot, MoonQuarterEvent } from './ephemeris.ts';
import { geographicLonLatDeg } from './frames.ts';
import {
  eclipticElongationDeg,
  isWaxing,
  phaseIndexFromEclipticElongation,
  phaseNameFromEclipticElongation,
  triangleGeometry,
} from './geometry.ts';
import type { PhaseName } from './geometry.ts';
import {
  isFiniteVec3,
  isRotationMatrix,
  matFromColumns,
  mulMat3,
  mulMat3Vec3,
  norm,
  normalize,
  rotZCoordinate,
  scale,
  sub,
} from './vec3.ts';
import type { Mat3, Vec3 } from './vec3.ts';

export interface GeoPoint {
  /** Geocentric latitude, degrees, -90..+90. */
  latDeg: number;
  /** East-positive longitude, degrees, (-180, +180]. */
  lonDeg: number;
}

export type EarthSection =
  | {
      available: true;
      /** Greenwich Apparent Sidereal Time, sidereal hours. */
      gastHours: number;
      /** Direction of the Sun from Earth's centre, as a point on Earth's surface. */
      subSolar: GeoPoint;
      /** Direction of the Moon from Earth's centre, as a point on Earth's surface. */
      subLunar: GeoPoint;
      /** Rotation taking EQJ coordinates to Earth-fixed coordinates (row-major, v_ef = M v_eqj). */
      eqjToEarthFixed: Mat3;
      accuracy: AccuracyNote;
    }
  | { available: false; reason: string };

export interface AstroState {
  /** The simulation instant this state describes: UTC milliseconds. */
  utcMs: number;
  utcIso: string;

  timeScale: {
    /** TT - UT used by the library, seconds. UTC is treated as UT1 (difference < 0.9 s). */
    deltaTSeconds: number;
    note: string;
  };

  moon: {
    geoEqjKm: Vec3;
    /** Unit vector Earth -> Moon, EQJ. */
    dirFromEarthEqj: Vec3;
    distanceKm: number;
    /** 2 asin(R/d) with R = 1737.4 km (a sphere), degrees. */
    angularDiameterDeg: number;
    accuracy: AccuracyNote;
  };

  sun: {
    geoEqjKm: Vec3;
    /** Unit vector Earth -> Sun, EQJ. */
    dirFromEarthEqj: Vec3;
    distanceKm: number;
    distanceAu: number;
    accuracy: AccuracyNote;
  };

  /** Directions seen FROM the Moon's centre (EQJ-parallel axes). Not Moon-fixed coordinates. */
  fromMoon: {
    sunDirEqj: Vec3;
    earthDirEqj: Vec3;
    sunDistanceKm: number;
    earthDistanceKm: number;
  };

  geometry: {
    /** Angle at Earth between Moon and Sun, 0..180. */
    elongationDeg: number;
    /** Angle at Moon between Sun and Earth, 0..180 (0 = full, 180 = new). */
    phaseAngleDeg: number;
    /** Angle at Sun between Earth and Moon (tiny). */
    angleAtSunDeg: number;
  };

  phase: {
    /** Ecliptic elongation, [0,360): 0 new, 90 first quarter, 180 full, 270 last quarter. */
    eclipticElongationDeg: number;
    name: PhaseName;
    /** 0..7 in the order of PHASE_NAMES. */
    index: number;
    waxing: boolean;
    /** Lit fraction of the visible disk as seen from Earth, 0..1. */
    diskIlluminatedFraction: number;
    /** The Sun always lights about half (one hemisphere) of the whole lunar globe. Constant; shown to avoid confusion with the apparent phase. */
    wholeGlobeLitFractionApprox: 0.5;
    accuracy: AccuracyNote;
  };

  libration: {
    elonDeg: number;
    elatDeg: number;
    moonEclipticLonDeg: number;
    moonEclipticLatDeg: number;
    signConvention: 'UNVERIFIED';
    accuracy: AccuracyNote;
  };

  earth: EarthSection;

  /** Quantities from the library's own functions, kept only to cross-check the values above. */
  diagnostics: {
    library: {
      moonPhaseDeg: number;
      phaseAngleDeg: number;
      illuminatedFraction: number;
      moonDistanceKm: number;
    };
    /** Ours minus the library's. */
    differences: {
      eclipticElongationDeg: number;
      phaseAngleDeg: number;
      diskIlluminatedFraction: number;
      moonDistanceKm: number;
    };
  };

  ephemerisName: string;
  warnings: string[];
}

function fail<T>(reason: string): Result<T> {
  return { ok: false, reason };
}

function rangeText(): string {
  return `${formatUtc(SUPPORTED_RANGE.startMs)} to ${formatUtc(SUPPORTED_RANGE.endMs)} (${SUPPORTED_RANGE.status})`;
}

/** Throws with a readable message if the ephemeris returned anything unusable. */
function validateSnapshot(s: EphemerisSnapshot): void {
  const finite = (name: string, v: number): void => {
    if (!Number.isFinite(v)) throw new RangeError(`Ephemeris returned a non-finite value for ${name}.`);
  };
  finite('deltaTSeconds', s.deltaTSeconds);
  if (!isFiniteVec3(s.moonGeoEqjAu)) throw new RangeError('Ephemeris returned a non-finite Moon vector.');
  if (!isFiniteVec3(s.sunGeoEqjAu)) throw new RangeError('Ephemeris returned a non-finite Sun vector.');
  if (!(norm(s.moonGeoEqjAu) > 0)) throw new RangeError('Ephemeris returned a zero-length Moon vector.');
  if (!(norm(s.sunGeoEqjAu) > 0)) throw new RangeError('Ephemeris returned a zero-length Sun vector.');
  const lb = s.libration;
  finite('libration.elonDeg', lb.elonDeg);
  finite('libration.elatDeg', lb.elatDeg);
  finite('libration.moonEclLonDeg', lb.moonEclLonDeg);
  finite('libration.moonEclLatDeg', lb.moonEclLatDeg);
  finite('libration.distKm', lb.distKm);
  finite('libraryMoonPhaseDeg', s.libraryMoonPhaseDeg);
  finite('libraryIllumination.phaseAngleDeg', s.libraryIllumination.phaseAngleDeg);
  finite('libraryIllumination.fraction', s.libraryIllumination.fraction);
}

function buildEarth(
  snapshot: EphemerisSnapshot,
  moonKm: Vec3,
  sunKm: Vec3,
  warnings: string[],
): EarthSection {
  const raw = snapshot.earthRotation;
  if (!raw.ok) {
    warnings.push(`Earth orientation unavailable: ${raw.reason}`);
    return { available: false, reason: raw.reason };
  }
  const [bx, by, bz] = raw.eqjAxesInEqd;
  if (!Number.isFinite(raw.gastHours) || !isFiniteVec3(bx) || !isFiniteVec3(by) || !isFiniteVec3(bz)) {
    const reason = 'The ephemeris returned non-finite Earth-orientation values.';
    warnings.push(`Earth orientation unavailable: ${reason}`);
    return { available: false, reason };
  }
  const eqjToEqd = matFromColumns(bx, by, bz);
  if (!isRotationMatrix(eqjToEqd)) {
    const reason = 'The EQJ to equator-of-date matrix is not a proper rotation.';
    warnings.push(`Earth orientation unavailable: ${reason}`);
    return { available: false, reason };
  }
  const eqjToEarthFixed = mulMat3(rotZCoordinate(raw.gastHours * 15), eqjToEqd);
  const subSolar = geographicLonLatDeg(mulMat3Vec3(eqjToEarthFixed, sunKm));
  const subLunar = geographicLonLatDeg(mulMat3Vec3(eqjToEarthFixed, moonKm));
  return {
    available: true,
    gastHours: raw.gastHours,
    subSolar,
    subLunar,
    eqjToEarthFixed,
    accuracy: ACCURACY.earthRotation,
  };
}

/**
 * Compute the full astronomical state for an explicit UTC instant using the
 * given ephemeris. Returns a Result: unusable input or ephemeris failure gives
 * { ok: false, reason } and never throws.
 */
export function computeAstroStateWith(eph: Ephemeris, utcMs: number): Result<AstroState> {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) {
    return fail('Simulation time must be a finite number of UTC milliseconds.');
  }
  if (!isInSupportedRange(utcMs)) {
    return fail(`Date is outside the supported range ${rangeText()}.`);
  }

  try {
    const snap = eph.snapshot(utcMs);
    validateSnapshot(snap);

    const moonKm = scale(snap.moonGeoEqjAu, KM_PER_AU);
    const sunKm = scale(snap.sunGeoEqjAu, KM_PER_AU);
    const tri = triangleGeometry(moonKm, sunKm);
    const elong = eclipticElongationDeg(moonKm, sunKm);
    const warnings: string[] = [];

    if (utcMs < REFERENCE_SPAN.startMs || utcMs > REFERENCE_SPAN.endMs) {
      warnings.push(
        `Time is outside ${formatUtc(REFERENCE_SPAN.startMs)} to ${formatUtc(REFERENCE_SPAN.endMs)}, ` +
          'the span covered by the reference spot checks. Accuracy there has not been demonstrated.',
      );
    }

    const moonToSunKm = sub(sunKm, moonKm);
    const earth = buildEarth(snap, moonKm, sunKm, warnings);
    const lb = snap.libration;

    const state: AstroState = {
      utcMs,
      utcIso: formatUtc(utcMs),
      timeScale: {
        deltaTSeconds: snap.deltaTSeconds,
        note:
          'Input is UTC. The library treats UTC as UT1 (difference under 0.9 s, about 0.5 arcsecond of lunar motion) ' +
          'and derives Terrestrial Time with a polynomial delta-T model. Delta-T for future dates is a prediction.',
      },
      moon: {
        geoEqjKm: moonKm,
        dirFromEarthEqj: normalize(moonKm),
        distanceKm: tri.earthMoonKm,
        angularDiameterDeg: 2 * Math.asin(MOON_REFERENCE_RADIUS_KM / tri.earthMoonKm) * (180 / Math.PI),
        accuracy: ACCURACY.positions,
      },
      sun: {
        geoEqjKm: sunKm,
        dirFromEarthEqj: normalize(sunKm),
        distanceKm: tri.earthSunKm,
        distanceAu: tri.earthSunKm / KM_PER_AU,
        accuracy: ACCURACY.positions,
      },
      fromMoon: {
        sunDirEqj: normalize(moonToSunKm),
        earthDirEqj: normalize(scale(moonKm, -1)),
        sunDistanceKm: tri.moonSunKm,
        earthDistanceKm: tri.earthMoonKm,
      },
      geometry: {
        elongationDeg: tri.elongationDeg,
        phaseAngleDeg: tri.phaseAngleDeg,
        angleAtSunDeg: tri.angleAtSunDeg,
      },
      phase: {
        eclipticElongationDeg: elong,
        name: phaseNameFromEclipticElongation(elong),
        index: phaseIndexFromEclipticElongation(elong),
        waxing: isWaxing(elong),
        diskIlluminatedFraction: tri.diskIlluminatedFraction,
        wholeGlobeLitFractionApprox: 0.5,
        accuracy: ACCURACY.phase,
      },
      libration: {
        elonDeg: lb.elonDeg,
        elatDeg: lb.elatDeg,
        moonEclipticLonDeg: lb.moonEclLonDeg,
        moonEclipticLatDeg: lb.moonEclLatDeg,
        signConvention: 'UNVERIFIED',
        accuracy: ACCURACY.libration,
      },
      earth,
      diagnostics: {
        library: {
          moonPhaseDeg: snap.libraryMoonPhaseDeg,
          phaseAngleDeg: snap.libraryIllumination.phaseAngleDeg,
          illuminatedFraction: snap.libraryIllumination.fraction,
          moonDistanceKm: lb.distKm,
        },
        differences: {
          eclipticElongationDeg: signedAngleDiffDeg(elong, snap.libraryMoonPhaseDeg),
          phaseAngleDeg: tri.phaseAngleDeg - snap.libraryIllumination.phaseAngleDeg,
          diskIlluminatedFraction: tri.diskIlluminatedFraction - snap.libraryIllumination.fraction,
          moonDistanceKm: tri.earthMoonKm - lb.distKm,
        },
      },
      ephemerisName: eph.name,
      warnings,
    };
    return { ok: true, value: state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Astronomy calculation failed: ${message}`);
  }
}

/**
 * The next `count` principal phases (New, First Quarter, Full, Last Quarter)
 * after an explicit UTC instant. These are the exact instants; compare with
 * the eight-name display convention in geometry.ts.
 */
export function nextMoonQuartersWith(
  eph: Ephemeris,
  startUtcMs: number,
  count: number,
): Result<MoonQuarterEvent[]> {
  if (typeof startUtcMs !== 'number' || !Number.isFinite(startUtcMs)) {
    return fail('Start time must be a finite number of UTC milliseconds.');
  }
  if (!isInSupportedRange(startUtcMs)) {
    return fail(`Date is outside the supported range ${rangeText()}.`);
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return fail('Count must be a whole number from 1 to 200.');
  }
  try {
    const events = eph.moonQuarters(startUtcMs, count);
    for (const e of events) {
      if (!Number.isFinite(e.utcMs)) throw new RangeError('Ephemeris returned a non-finite phase time.');
    }
    return { ok: true, value: events };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Moon-phase search failed: ${message}`);
  }
}
