/**
 * Public entry point of the astronomy module.
 *
 *   import { computeAstroState } from './astro/index.ts';
 *   const result = computeAstroState(simulationUtcMs);
 *   if (result.ok) { ... result.value.moon.geoEqjKm ... }
 *
 * The caller must always pass the simulation time (UTC milliseconds), for
 * example from the shared clock in src/core/time.ts. This module never reads
 * the computer's clock.
 */
import type { Result } from '../core/time.ts';
import { astronomyEngineEphemeris } from './ephemeris-astronomy-engine.ts';
import type { MoonQuarterEvent } from './ephemeris.ts';
import { computeAstroStateWith, nextMoonQuartersWith } from './state.ts';
import type { AstroState } from './state.ts';

export function computeAstroState(utcMs: number): Result<AstroState> {
  return computeAstroStateWith(astronomyEngineEphemeris, utcMs);
}

export function nextMoonQuarters(startUtcMs: number, count: number): Result<MoonQuarterEvent[]> {
  return nextMoonQuartersWith(astronomyEngineEphemeris, startUtcMs, count);
}

export { computeAstroStateWith, nextMoonQuartersWith } from './state.ts';
export { astronomyEngineEphemeris } from './ephemeris-astronomy-engine.ts';
export { ACCURACY, ACCURACY_LEVEL_NAMES } from './accuracy.ts';
export { KM_PER_AU, MOON_REFERENCE_RADIUS_KM, REFERENCE_SPAN, REFERENCE_CHECK_YEARS } from './constants.ts';
export { PHASE_NAMES } from './geometry.ts';
export type { AccuracyLevel, AccuracyNote } from './accuracy.ts';
export type { Ephemeris, EphemerisSnapshot, MoonQuarterEvent } from './ephemeris.ts';
export type { AstroState, EarthSection, GeoPoint } from './state.ts';
export type { PhaseName } from './geometry.ts';
export type { Mat3, Vec3 } from './vec3.ts';
