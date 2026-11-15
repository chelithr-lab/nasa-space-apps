/**
 * The ONLY file in src/sim that imports the real astronomy entry point
 * (src/astro/index.ts, which loads the astronomy-engine library). Everything
 * else in src/sim receives these functions as arguments, which keeps the logic
 * testable without the library.
 */
import type { Result } from '../core/time.ts';
import { computeAstroState, nextMoonQuarters } from '../astro/index.ts';
import type { MoonQuarterEvent } from '../astro/index.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { frameModelFromSearch } from './frameModel.ts';
import { buildSnapshot } from './simSnapshot.ts';
import type { SimSnapshot } from './simSnapshot.ts';

/** Read once at start-up: ?frame=approximate restores the original simplified orientation (a reversible A/B switch). */
const FRAME_MODEL = frameModelFromSearch(typeof location !== 'undefined' ? location.search : '');

export function computeSnapshotLive(utcMs: number): Result<SimSnapshot> {
  return buildSnapshot(utcMs, computeAstroState, FRAME_MODEL);
}

export function quartersLive(startUtcMs: number, count: number): Result<MoonQuarterEvent[]> {
  return nextMoonQuarters(startUtcMs, count);
}

/** Geocentric EQJ Moon position in km, or null if the instant cannot be computed. */
export function moonKmLive(utcMs: number): Vec3 | null {
  const r = computeAstroState(utcMs);
  return r.ok ? r.value.moon.geoEqjKm : null;
}
