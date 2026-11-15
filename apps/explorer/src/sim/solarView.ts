/**
 * Pure geometry behind the Lunar Solar Intelligence drawings, so the mapping
 * from calculated values to pixels is tested instead of trusted.
 *
 * Sky plot: the view is "looking UP at the sky", the way a planetarium chart
 * is drawn. Zenith is the centre, the horizon is the rim, north is at the top,
 * and therefore EAST IS ON THE LEFT (looking up, east and west swap relative to
 * a map). The labels in the interface say so.
 */
import type { SolarEvent, SiteScan } from './solarScan.ts';
import { nextEvent, previousEvent } from './solarScan.ts';

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Position on a sky plot of radius `radius` centred on (0, 0); y grows downward (screen), north is up. */
export function skyPoint(elevationDeg: number, azimuthDeg: number, radius: number): XY {
  const r = (radius * (90 - Math.min(90, Math.max(-90, elevationDeg)))) / 90;
  const a = (azimuthDeg * Math.PI) / 180;
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) };
}

export interface DaylightCycle {
  /** Sunrise that starts the cycle shown (ms). */
  readonly startMs: number;
  /** Sunset inside the cycle (ms). */
  readonly sunsetMs: number;
  /** Next sunrise, which ends the cycle (ms). */
  readonly endMs: number;
  /** Where "now" falls, 0..1 of the cycle. */
  readonly nowFraction: number;
  /** Where the sunset falls, 0..1 of the cycle (the lit part is 0..dayFraction). */
  readonly dayFraction: number;
}

/**
 * One full light-dark cycle (sunrise to the next sunrise) around `utcMs`, from
 * events that were actually found. null when the scanned window does not contain
 * a sunrise before, a sunset after and a sunrise after the time; the interface
 * then says the cycle is not available instead of drawing a guess.
 */
export function daylightCycle(events: readonly SolarEvent[], scan: SiteScan, utcMs: number): DaylightCycle | null {
  if (utcMs < scan.t0 || utcMs > scan.t1) return null;
  const rises = ['sunrise'] as const;
  const lastRise = previousEvent(events, utcMs, rises);
  const nextRise = nextEvent(events, utcMs, rises);
  if (lastRise === null || nextRise === null) return null;
  const sunset = events.find((e) => e.kind === 'sunset' && e.utcMs > lastRise.utcMs && e.utcMs < nextRise.utcMs);
  if (sunset === undefined) return null;
  const span = nextRise.utcMs - lastRise.utcMs;
  if (!(span > 0)) return null;
  return {
    startMs: lastRise.utcMs,
    sunsetMs: sunset.utcMs,
    endMs: nextRise.utcMs,
    nowFraction: (utcMs - lastRise.utcMs) / span,
    dayFraction: (sunset.utcMs - lastRise.utcMs) / span,
  };
}

/** Point on a circle for a fraction of a turn clockwise from the top. */
export function ringPoint(fraction: number, radius: number): XY {
  const a = fraction * 2 * Math.PI;
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

/** Linear map of a value in [lo, hi] to [outLo, outHi]; hi == lo maps to the middle. */
export function scaleLinear(v: number, lo: number, hi: number, outLo: number, outHi: number): number {
  if (!(hi > lo)) return (outLo + outHi) / 2;
  return outLo + ((v - lo) / (hi - lo)) * (outHi - outLo);
}

/** Inverse of a time axis: pixel position back to a time, clamped to the axis. */
export function timeAtX(x: number, x0: number, x1: number, t0: number, t1: number): number {
  const f = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return t0 + f * (t1 - t0);
}
