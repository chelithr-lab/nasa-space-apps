/**
 * Controller around the Stage 1 clock (src/core/time.ts).
 *
 * It adds no second clock and no astronomy: every method calls the Stage 1
 * functions. It only remembers the current Clock value, turns invalid input
 * into readable messages, and pauses playback at the edge of the supported
 * range. The real-time source is injected (`nowMs`) so tests can control it.
 */
import {
  createClock,
  offsetFromPresentSeconds,
  parseUtcInput,
  pause,
  play,
  readClock,
  returnToPresent,
  setSimTime,
  setSpeed,
  stepBy,
} from '../core/time.ts';
import type { Clock, Result } from '../core/time.ts';

export const SPEED_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '1x (real time)', value: 1 },
  { label: '1 minute / s', value: 60 },
  { label: '10 minutes / s', value: 600 },
  { label: '1 hour / s', value: 3600 },
  { label: '6 hours / s', value: 21600 },
  { label: '1 day / s', value: 86400 },
  { label: '3 days / s', value: 259200 },
  { label: '10 days / s', value: 864000 },
  { label: '30 days / s', value: 2592000 },
];

const MAX_SPEED = 1e7;

export interface ClockView {
  simMs: number;
  playing: boolean;
  /** Signed: negative means backwards. */
  speed: number;
  /** Simulated seconds minus real seconds. */
  offsetFromPresentSeconds: number;
  /** True when the simulation follows the real clock (playing at 1x within 2 s of now). */
  live: boolean;
  /** Informational message, for example that playback stopped at a range edge. */
  notice: string | null;
}

export class SimClock {
  private clock: Clock;
  private noticeText: string | null = null;
  private readonly nowMs: () => number;

  constructor(nowMs: () => number) {
    this.nowMs = nowMs;
    this.clock = createClock(nowMs());
  }

  /** Current simulation time (UTC ms). Pauses playback if it reached a range edge. */
  readSimMs(): number {
    const now = this.nowMs();
    const r = readClock(this.clock, now);
    if (r.hitBoundary && this.clock.playing) {
      this.clock = pause(this.clock, now);
      this.noticeText = 'Playback stopped at the edge of the supported date range.';
    }
    return r.simMs;
  }

  view(): ClockView {
    const now = this.nowMs();
    const simMs = this.readSimMs();
    const offset = offsetFromPresentSeconds(this.clock, now);
    return {
      simMs,
      playing: this.clock.playing,
      speed: this.clock.speed,
      offsetFromPresentSeconds: offset,
      live: this.clock.playing && this.clock.speed === 1 && Math.abs(offset) < 2,
      notice: this.noticeText,
    };
  }

  clearNotice(): void {
    this.noticeText = null;
  }

  play(): void {
    this.clock = play(this.clock, this.nowMs());
  }

  pause(): void {
    this.clock = pause(this.clock, this.nowMs());
  }

  /** Signed speed in simulated seconds per real second. */
  setSpeed(speed: number): Result<true> {
    if (!Number.isFinite(speed) || speed === 0 || Math.abs(speed) > MAX_SPEED) {
      return { ok: false, reason: 'Speed must be a non-zero number up to 10,000,000 (negative plays backwards).' };
    }
    const r = setSpeed(this.clock, speed, this.nowMs());
    if (!r.ok) return r;
    this.clock = r.value;
    this.noticeText = null;
    return { ok: true, value: true };
  }

  stepSeconds(deltaSeconds: number): Result<true> {
    const r = stepBy(this.clock, deltaSeconds, this.nowMs());
    if (!r.ok) return r;
    this.clock = r.value;
    this.noticeText = null;
    return { ok: true, value: true };
  }

  setSimMs(utcMs: number): Result<true> {
    const r = setSimTime(this.clock, utcMs, this.nowMs());
    if (!r.ok) return r;
    this.clock = r.value;
    this.noticeText = null;
    return { ok: true, value: true };
  }

  /** Strict UTC text such as 2026-10-19 or 2026-10-19T12:30:00Z. */
  setFromUtcText(text: string): Result<true> {
    const parsed = parseUtcInput(text);
    if (!parsed.ok) return parsed;
    return this.setSimMs(parsed.value);
  }

  /**
   * Jump back to the real current time and follow it (playing at 1x).
   * Uses the Stage 1 returnToPresent, then starts playback so the display
   * stays "live" instead of freezing at the moment of the click.
   */
  goToPresent(): void {
    const now = this.nowMs();
    this.clock = play(returnToPresent(now), now);
    this.noticeText = null;
  }
}
