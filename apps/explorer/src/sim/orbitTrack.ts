/**
 * The Moon's COMPUTED path around the Earth, for the secondary orbit view.
 *
 * Every point is the ephemeris position at a real instant (accuracy level 2),
 * in the same geocentric EQJ frame and true kilometres as everything else. It
 * is not an idealised circle and not a "reference ellipse". It is a sample of
 * where the model puts the Moon, centred on the selected time.
 */
import { toScene } from './sceneMapping.ts';
import { scale } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';

/** One scene unit in the orbit view equals this many kilometres. */
export const KM_PER_SCENE_UNIT = 100_000;

/** Mean radius of the Earth, km (IUGG value 6371.0088). Used only to size the schematic Earth. */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;
/** Lunar reference radius, km (NASA SVS Moon Kit reference sphere, same as src/astro/constants.ts). */
export const MOON_RADIUS_KM = 1737.4;
/** The Earth and Moon bodies are drawn this many times too large so they are visible. Distances are NOT scaled. */
export const BODY_SIZE_EXAGGERATION = 8;

export function kmToSceneUnits(vKm: Vec3): Vec3 {
  return scale(toScene(vKm), 1 / KM_PER_SCENE_UNIT);
}

export interface TrackSample {
  utcMs: number;
  /** Geocentric EQJ position, km. */
  posKm: Vec3;
}

export interface MoonTrack {
  centerMs: number;
  samples: TrackSample[];
}

export type MoonPositionFn = (utcMs: number) => Vec3 | null;

const DAY_MS = 86_400_000;

/** Samples from centre - halfSpan to centre + halfSpan; instants the ephemeris cannot compute are skipped. */
export function sampleMoonTrack(
  centerMs: number,
  halfSpanDays: number,
  stepDays: number,
  moonAt: MoonPositionFn,
): MoonTrack {
  if (!(halfSpanDays > 0) || !(stepDays > 0)) throw new RangeError('Track span and step must be positive.');
  const n = Math.round(halfSpanDays / stepDays);
  const samples: TrackSample[] = [];
  for (let i = -n; i <= n; i++) {
    const utcMs = centerMs + i * stepDays * DAY_MS;
    const posKm = moonAt(utcMs);
    if (posKm !== null) samples.push({ utcMs, posKm });
  }
  return { centerMs, samples };
}

export interface TrackCacheOptions {
  halfSpanDays?: number;
  stepDays?: number;
  /** Recompute only after the selected time moves this far from the track centre. */
  recenterDays?: number;
  /** ...and not more often than this many real milliseconds (protects fast playback). */
  minIntervalMs?: number;
}

export class MoonTrackCache {
  private track: MoonTrack | null = null;
  private lastComputeRealMs = Number.NEGATIVE_INFINITY;
  private readonly moonAt: MoonPositionFn;
  private readonly halfSpanDays: number;
  private readonly stepDays: number;
  private readonly recenterMs: number;
  private readonly minIntervalMs: number;
  /** How many times the track was actually recomputed (for tests and diagnostics). */
  recomputeCount = 0;

  constructor(moonAt: MoonPositionFn, options: TrackCacheOptions = {}) {
    this.moonAt = moonAt;
    this.halfSpanDays = options.halfSpanDays ?? 13.5;
    this.stepDays = options.stepDays ?? 0.5;
    this.recenterMs = (options.recenterDays ?? 3) * DAY_MS;
    this.minIntervalMs = options.minIntervalMs ?? 400;
  }

  /** Returns the same object until a recomputation happens, so callers can compare by identity. */
  get(centerMs: number, realNowMs: number): MoonTrack {
    const stale =
      this.track === null ||
      (Math.abs(centerMs - this.track.centerMs) > this.recenterMs &&
        realNowMs - this.lastComputeRealMs >= this.minIntervalMs);
    if (stale) {
      this.track = sampleMoonTrack(centerMs, this.halfSpanDays, this.stepDays, this.moonAt);
      this.lastComputeRealMs = realNowMs;
      this.recomputeCount++;
    }
    return this.track as MoonTrack;
  }

  invalidate(): void {
    this.track = null;
  }
}
