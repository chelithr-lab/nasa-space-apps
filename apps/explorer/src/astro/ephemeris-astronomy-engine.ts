/**
 * The ONLY file that imports the `astronomy-engine` package.
 *
 * Library facts this file relies on. Confirmed 2026-10-19 from the library's
 * published JS README: numeric dates are UTC days since J2000, TT comes from the
 * Espenak and Meeus delta-T model, UT1 is approximated by UTC, and
 * Rotation_EQJ_EQD / RotateVector exist. NOT stated in the docs I could read:
 * the Vector constructor arguments, the GeoVector aberration flag meaning, and
 * the Libration sign convention. Those are used as I remember them and are
 * checked only by running the reference tests on a machine with the package:
 *  - A plain NUMBER passed as a "date" means UT days since J2000, NOT
 *    milliseconds. To avoid that trap this file always passes a JavaScript
 *    Date object (or an AstroTime made from one), never a bare number.
 *  - A Date is interpreted as UT1/UTC; Terrestrial Time is derived with the
 *    Espenak & Meeus delta-T polynomial (AstroTime.tt - AstroTime.ut).
 *  - GeoMoon(date): Earth centre -> Moon centre, EQJ, AU.
 *  - GeoVector(body, date, aberration): Earth centre -> body, EQJ, AU, always
 *    corrected for light travel time; aberration optional (we pass false).
 *  - Libration(date): { elat, elon, mlat, mlon, dist_km, diam_deg }, degrees.
 *    Sign convention and physical-libration handling are NOT documented.
 *  - MoonPhase(date): ecliptic longitude difference Moon - Sun, [0, 360).
 *  - Illumination(body, date): { phase_angle (deg), phase_fraction (0..1), ... }.
 *  - SiderealTime(date): Greenwich Apparent Sidereal Time in hours [0, 24).
 *  - SearchMoonQuarter(date) / NextMoonQuarter(mq): quarter 0..3 and time.
 *
 * NOT confirmed from the declarations I could read (so accessed defensively
 * and reported as "unavailable" instead of guessed): Rotation_EQJ_EQD and
 * RotateVector. See readEarthRotation().
 */
import * as AstronomyModule from 'astronomy-engine';
import type { EarthRotationRaw, Ephemeris, EphemerisSnapshot, MoonQuarterEvent } from './ephemeris.ts';
import type { Vec3 } from './vec3.ts';

type AstronomyApi = typeof AstronomyModule;

/**
 * Resolve the named ESM API exposed by astronomy-engine.
 * Fail loudly if the required API is unavailable.
 */
function resolveLibrary(): AstronomyApi {
  if (typeof (AstronomyModule as { GeoMoon?: unknown }).GeoMoon === 'function') {
    return AstronomyModule;
  }

  throw new Error(
    'The astronomy-engine package was found but its API (GeoMoon) is missing. ' +
      'Check the installed version with: npm ls astronomy-engine',
  );
}

const lib = resolveLibrary();

function toVec3(v: { x: number; y: number; z: number }): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * EQJ -> true equator of date. Done by rotating the three EQJ unit axes with
 * the library's own RotateVector, so this code never depends on how the
 * library stores its rotation matrix.
 */
function readEarthRotation(t: InstanceType<AstronomyApi['AstroTime']>): EarthRotationRaw {
  try {
    const loose = lib as unknown as Record<string, unknown>;
    const makeRotation = loose['Rotation_EQJ_EQD'];
    const rotateVector = loose['RotateVector'];
    if (typeof makeRotation !== 'function' || typeof rotateVector !== 'function') {
      return {
        ok: false,
        reason: 'This astronomy-engine version does not expose Rotation_EQJ_EQD / RotateVector.',
      };
    }
    const rotation: unknown = (makeRotation as (time: unknown) => unknown)(t);
    const rotate = rotateVector as (r: unknown, v: unknown) => { x: number; y: number; z: number };
    const ax = toVec3(rotate(rotation, new lib.Vector(1, 0, 0, t)));
    const ay = toVec3(rotate(rotation, new lib.Vector(0, 1, 0, t)));
    const az = toVec3(rotate(rotation, new lib.Vector(0, 0, 1, t)));
    return { ok: true, gastHours: lib.SiderealTime(t), eqjAxesInEqd: [ax, ay, az] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Earth orientation could not be computed: ${message}` };
  }
}

function toQuarter(q: number): 0 | 1 | 2 | 3 {
  if (q === 0 || q === 1 || q === 2 || q === 3) return q;
  throw new RangeError(`Unexpected lunar quarter number ${String(q)}.`);
}

export const astronomyEngineEphemeris: Ephemeris = {
  name: 'astronomy-engine (npm)',

  snapshot(utcMs: number): EphemerisSnapshot {
    // Always a Date object: a bare number would be read as days since J2000.
    const t = lib.MakeTime(new Date(utcMs));
    const moon = lib.GeoMoon(t);
    const sun = lib.GeoVector(lib.Body.Sun, t, false);
    const libration = lib.Libration(t);
    const illumination = lib.Illumination(lib.Body.Moon, t);
    return {
      deltaTSeconds: (t.tt - t.ut) * 86400,
      moonGeoEqjAu: toVec3(moon),
      sunGeoEqjAu: toVec3(sun),
      libration: {
        elonDeg: libration.elon,
        elatDeg: libration.elat,
        moonEclLonDeg: libration.mlon,
        moonEclLatDeg: libration.mlat,
        distKm: libration.dist_km,
        apparentDiameterDeg: libration.diam_deg,
      },
      libraryMoonPhaseDeg: lib.MoonPhase(t),
      libraryIllumination: {
        phaseAngleDeg: illumination.phase_angle,
        fraction: illumination.phase_fraction,
      },
      earthRotation: readEarthRotation(t),
    };
  },

  moonQuarters(startUtcMs: number, count: number): MoonQuarterEvent[] {
    const out: MoonQuarterEvent[] = [];
    let mq = lib.SearchMoonQuarter(new Date(startUtcMs));
    for (let i = 0; i < count; i++) {
      out.push({ quarter: toQuarter(mq.quarter), utcMs: mq.time.date.getTime() });
      if (i < count - 1) mq = lib.NextMoonQuarter(mq);
    }
    return out;
  },
};
