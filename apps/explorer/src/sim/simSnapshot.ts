/**
 * One consistent snapshot for a UTC instant, shared by BOTH 3D views.
 *
 * It wraps the validated Stage 2 AstroState and adds the approximate
 * Moon-fixed frame and the Sun/Earth directions expressed in it. Nothing here
 * reads the computer clock: the caller supplies the simulation time and the
 * function that computes the astronomy (so tests can inject a synthetic one).
 */
import type { Result } from '../core/time.ts';
import type { AstroState } from '../astro/state.ts';
import { approximateMoonFrame, moonLighting } from './moonFrame.ts';
import { iauMoonFrame } from './lunarOrientation.ts';
import type { MoonFrame, MoonLighting } from './moonFrame.ts';

export interface SimSnapshot {
  utcMs: number;
  /** Stage 2 result: Moon, Sun, Earth, phase, libration (unverified), warnings. */
  astro: AstroState;
  /** Moon-fixed frame: the IAU series by default in the app, or the approximate one (see FrameModelId). */
  moonFrame: MoonFrame;
  /** Sun and Earth directions in that frame, sub-solar and sub-Earth points. */
  lighting: MoonLighting;
}

export type AstroComputeFn = (utcMs: number) => Result<AstroState>;

/**
 * Which Moon-fixed orientation to use.
 *  - 'approximate': the original simplified frame (zero libration, ecliptic pole). Kept so behaviour can be compared and rolled back.
 *  - 'iau': the IAU rotational-elements series (libration and pole direction included). Needed for site-level solar work.
 */
export type FrameModelId = 'approximate' | 'iau';

export function buildSnapshot(utcMs: number, computeAstro: AstroComputeFn, frameModel: FrameModelId = 'approximate'): Result<SimSnapshot> {
  const r = computeAstro(utcMs);
  if (!r.ok) return { ok: false, reason: r.reason };
  const astro = r.value;
  const frame = frameModel === 'iau' ? iauMoonFrame(utcMs, astro.timeScale.deltaTSeconds) : approximateMoonFrame(astro.fromMoon.earthDirEqj);
  if (frame === null) {
    return { ok: false, reason: 'The Moon-fixed frame could not be built from the Earth direction.' };
  }
  const lighting = moonLighting(frame, astro.fromMoon.sunDirEqj, astro.fromMoon.earthDirEqj);
  return { ok: true, value: { utcMs, astro, moonFrame: frame, lighting } };
}
