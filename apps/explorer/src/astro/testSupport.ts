/**
 * SYNTHETIC ephemeris for unit tests. NOT astronomy.
 *
 * It returns whatever vectors the test hands it, so tests can check the wiring
 * and the geometry maths against hand-calculated answers without the real
 * library. Passing a test that uses this file says NOTHING about the accuracy
 * of the real Moon or Sun positions; that is checked only by reference.test.ts
 * against published data.
 */
import { KM_PER_AU } from './constants.ts';
import type { Ephemeris, EphemerisSnapshot, LibrationRaw, MoonQuarterEvent } from './ephemeris.ts';
import { eclipticElongationDeg, triangleGeometry } from './geometry.ts';
import { norm, scale, vec3 } from './vec3.ts';
import type { Vec3 } from './vec3.ts';

export interface SyntheticOptions {
  moonGeoKm: Vec3;
  sunGeoKm: Vec3;
  gastHours?: number;
  /** Images of EQJ x, y, z axes in EQD coordinates. Default: identity. `null` = Earth orientation unavailable. */
  eqjAxesInEqd?: readonly [Vec3, Vec3, Vec3] | null;
  deltaTSeconds?: number;
  libration?: Partial<LibrationRaw>;
  /** Override the "library" cross-check values (default: consistent with the geometry). */
  libraryMoonPhaseDeg?: number;
  libraryPhaseAngleDeg?: number;
  libraryFraction?: number;
  throwMessage?: string;
  quarters?: MoonQuarterEvent[];
}

export type SyntheticEphemeris = Ephemeris & { receivedUtcMs: number[] };

export function makeSyntheticEphemeris(o: SyntheticOptions): SyntheticEphemeris {
  const received: number[] = [];
  const tri = triangleGeometry(o.moonGeoKm, o.sunGeoKm);
  const identity: readonly [Vec3, Vec3, Vec3] = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];

  return {
    name: 'SYNTHETIC test ephemeris (not astronomy)',
    receivedUtcMs: received,
    snapshot(utcMs: number): EphemerisSnapshot {
      received.push(utcMs);
      if (o.throwMessage !== undefined) throw new Error(o.throwMessage);
      const libration: LibrationRaw = {
        elonDeg: 0,
        elatDeg: 0,
        moonEclLonDeg: 0,
        moonEclLatDeg: 0,
        distKm: norm(o.moonGeoKm),
        apparentDiameterDeg: 0.5,
        ...o.libration,
      };
      const axes = o.eqjAxesInEqd === undefined ? identity : o.eqjAxesInEqd;
      return {
        deltaTSeconds: o.deltaTSeconds ?? 69,
        moonGeoEqjAu: scale(o.moonGeoKm, 1 / KM_PER_AU),
        sunGeoEqjAu: scale(o.sunGeoKm, 1 / KM_PER_AU),
        libration,
        libraryMoonPhaseDeg: o.libraryMoonPhaseDeg ?? eclipticElongationDeg(o.moonGeoKm, o.sunGeoKm),
        libraryIllumination: {
          phaseAngleDeg: o.libraryPhaseAngleDeg ?? tri.phaseAngleDeg,
          fraction: o.libraryFraction ?? tri.diskIlluminatedFraction,
        },
        earthRotation:
          axes === null
            ? { ok: false, reason: 'synthetic: Earth orientation switched off' }
            : { ok: true, gastHours: o.gastHours ?? 0, eqjAxesInEqd: axes },
      };
    },
    moonQuarters(_startUtcMs: number, count: number): MoonQuarterEvent[] {
      const q = o.quarters ?? [];
      return q.slice(0, count);
    },
  };
}
