/**
 * Frame-time governor for glass panels (pure logic, no DOM, no timers).
 *
 * Why: backdrop blur is re-computed by the GPU every frame while the Moon behind it is moving.
 * On integrated graphics that can cost frames. This module decides, from measured frame times,
 * whether glass panels should fall back to the near-solid tier. Nothing here is a measurement of
 * any particular computer: it only reacts to the frame intervals it is given.
 *
 * Rules (auto mode):
 *  - Frames are collected in two rolling windows: one while no glass panel is visible (the
 *    baseline) and one while at least one is visible.
 *  - With fewer than MIN_GLASS_FRAMES glass frames there is no decision: glass stays on.
 *  - With a valid baseline: switch to solid only if the glass window's 95th percentile is slower than
 *    ABSOLUTE_SLOW_MS AND at least GLASS_COST_MS slower than the baseline. This avoids blaming glass
 *    when the Moon alone is already slow.
 *  - Without a baseline: switch to solid if the glass window's 95th percentile is slower than ABSOLUTE_SLOW_MS.
 *  - Once solid, it stays solid until the mode changes or the page reloads, so the interface never flickers.
 */

export type GlassMode = 'auto' | 'on' | 'off';
export type GlassState = 'glass' | 'solid';

export const FRAME_WINDOW = 120;
export const MIN_GLASS_FRAMES = 90;
/** Intervals longer than this are a hidden tab or a pause, not rendering cost. */
export const MAX_VALID_FRAME_MS = 250;
export const ABSOLUTE_SLOW_MS = 22;
export const GLASS_COST_MS = 4;

export interface FrameStats {
  readonly frames: number;
  readonly median: number;
  readonly p95: number;
}

/** Nearest-rank percentile of a non-empty list. p is in (0, 100]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError('percentile needs at least one value');
  if (!(p > 0 && p <= 100)) throw new RangeError('p must be in (0, 100]');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export const EMPTY_STATS: FrameStats = { frames: 0, median: 0, p95: 0 };

/** Fixed-size rolling window of frame intervals in milliseconds. */
export class FrameWindow {
  private readonly size: number;
  private readonly values: number[] = [];

  constructor(size: number = FRAME_WINDOW) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('window size must be a positive integer');
    this.size = size;
  }

  /** Returns false (and stores nothing) for a value that is not a usable frame interval. */
  push(ms: number): boolean {
    if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_VALID_FRAME_MS) return false;
    this.values.push(ms);
    if (this.values.length > this.size) this.values.shift();
    return true;
  }

  get count(): number {
    return this.values.length;
  }

  stats(): FrameStats {
    if (this.values.length === 0) return EMPTY_STATS;
    return { frames: this.values.length, median: percentile(this.values, 50), p95: percentile(this.values, 95) };
  }

  reset(): void {
    this.values.length = 0;
  }
}

export interface GlassDecisionInput {
  readonly mode: GlassMode;
  readonly current: GlassState;
  /** Frames measured while a glass panel was visible. */
  readonly glass: FrameStats;
  /** Frames measured while no glass panel was visible, or null if none were seen. */
  readonly baseline: FrameStats | null;
}

export function decideGlass(input: GlassDecisionInput): GlassState {
  if (input.mode === 'on') return 'glass';
  if (input.mode === 'off') return 'solid';
  if (input.current === 'solid') return 'solid';
  if (input.glass.frames < MIN_GLASS_FRAMES) return 'glass';
  if (input.glass.p95 <= ABSOLUTE_SLOW_MS) return 'glass';
  const base = input.baseline;
  if (base !== null && base.frames >= MIN_GLASS_FRAMES) {
    return input.glass.p95 - base.p95 >= GLASS_COST_MS ? 'solid' : 'glass';
  }
  return 'solid';
}

/** Accepts 'auto', 'on' or 'off' (any case); anything else is 'auto'. */
export function parseGlassMode(raw: string | null | undefined): GlassMode {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'on' || v === 'off' || v === 'auto' ? v : 'auto';
}
