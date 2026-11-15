/**
 * Shared simulation clock (CLPS 3D Lunar Explorer).
 *
 * ONE clock drives both views. Everything is stored as UTC milliseconds
 * since 1970-01-01T00:00:00Z (JavaScript's Date.now() scale).
 *
 * Design rule (no drift): the simulation time is NEVER accumulated frame by
 * frame. We store an "anchor" (a simulation time and the real time at which
 * it was valid) plus a speed, and compute:
 *
 *     simMs = anchorSimMs + (realNowMs - anchorRealMs) * speed
 *
 * so the value depends only on the real clock reading, not on frame count.
 *
 * Time standard note: JavaScript time is UTC-like and ignores leap seconds
 * (POSIX time). The difference between UTC and Terrestrial Time (TT) is
 * about 69 s today. The astronomy library chosen in a later stage is
 * responsible for the UT/TT conversion; this module only handles UTC.
 *
 * This file has no dependencies and uses only erasable TypeScript syntax.
 */

/**
 * PROVISIONAL supported range. It is a placeholder chosen for safe input
 * validation only. It MUST be replaced by a range justified by the accuracy
 * of the astronomy method actually used (to be validated in Stage 2).
 */
export const SUPPORTED_RANGE = {
  startMs: Date.UTC(1900, 0, 1, 0, 0, 0),
  endMs: Date.UTC(2100, 11, 31, 23, 59, 59),
  status: 'PROVISIONAL' as const,
};

export type Clock = {
  readonly anchorSimMs: number;
  readonly anchorRealMs: number;
  /** Simulated seconds per real second. Negative = backwards. */
  readonly speed: number;
  readonly playing: boolean;
};

export type ClockReading = {
  simMs: number;
  /** True if playback reached the edge of the supported range. */
  hitBoundary: boolean;
};

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export function isInSupportedRange(ms: number): boolean {
  return (
    Number.isFinite(ms) &&
    ms >= SUPPORTED_RANGE.startMs &&
    ms <= SUPPORTED_RANGE.endMs
  );
}

function rangeMessage(): string {
  return (
    `Date is outside the supported range ` +
    `${formatUtc(SUPPORTED_RANGE.startMs)} to ${formatUtc(SUPPORTED_RANGE.endMs)} ` +
    `(${SUPPORTED_RANGE.status}).`
  );
}

/** Start a paused clock showing the real current time. */
export function createClock(realNowMs: number): Clock {
  return {
    anchorSimMs: realNowMs,
    anchorRealMs: realNowMs,
    speed: 1,
    playing: false,
  };
}

/** Read the simulation time. Pure: depends only on the clock and realNowMs. */
export function readClock(clock: Clock, realNowMs: number): ClockReading {
  if (!clock.playing) {
    return { simMs: clock.anchorSimMs, hitBoundary: false };
  }
  const raw =
    clock.anchorSimMs + (realNowMs - clock.anchorRealMs) * clock.speed;
  if (raw > SUPPORTED_RANGE.endMs) {
    return { simMs: SUPPORTED_RANGE.endMs, hitBoundary: true };
  }
  if (raw < SUPPORTED_RANGE.startMs) {
    return { simMs: SUPPORTED_RANGE.startMs, hitBoundary: true };
  }
  return { simMs: raw, hitBoundary: false };
}

/** Re-anchor at the current reading so later changes stay continuous. */
function reanchor(clock: Clock, realNowMs: number): Clock {
  const { simMs } = readClock(clock, realNowMs);
  return { ...clock, anchorSimMs: simMs, anchorRealMs: realNowMs };
}

export function setSimTime(
  clock: Clock,
  simMs: number,
  realNowMs: number,
): Result<Clock> {
  if (!Number.isFinite(simMs)) {
    return { ok: false, reason: 'That is not a valid date and time.' };
  }
  if (!isInSupportedRange(simMs)) {
    return { ok: false, reason: rangeMessage() };
  }
  return {
    ok: true,
    value: { ...clock, anchorSimMs: simMs, anchorRealMs: realNowMs },
  };
}

export function play(clock: Clock, realNowMs: number): Clock {
  const base = reanchor(clock, realNowMs);
  return { ...base, playing: true };
}

export function pause(clock: Clock, realNowMs: number): Clock {
  const base = reanchor(clock, realNowMs);
  return { ...base, playing: false };
}

export function setSpeed(
  clock: Clock,
  speed: number,
  realNowMs: number,
): Result<Clock> {
  if (!Number.isFinite(speed) || speed === 0) {
    return {
      ok: false,
      reason: 'Speed must be a non-zero number (negative plays backwards).',
    };
  }
  const base = reanchor(clock, realNowMs);
  return { ok: true, value: { ...base, speed } };
}

/** Step forward/backward by a number of simulated seconds (paused or playing). */
export function stepBy(
  clock: Clock,
  deltaSeconds: number,
  realNowMs: number,
): Result<Clock> {
  const { simMs } = readClock(clock, realNowMs);
  return setSimTime(clock, simMs + deltaSeconds * 1000, realNowMs);
}

/**
 * Jump back to the real current time and pause at speed 1.
 * Only the clock changes; saved scenarios are stored elsewhere and are
 * not touched by this function.
 */
export function returnToPresent(realNowMs: number): Clock {
  return createClock(realNowMs);
}

/** How far the selected simulation time is from the real time (seconds). */
export function offsetFromPresentSeconds(
  clock: Clock,
  realNowMs: number,
): number {
  return (readClock(clock, realNowMs).simMs - realNowMs) / 1000;
}

/**
 * Parse a user-typed UTC timestamp. Accepts only the strict forms
 * YYYY-MM-DD, YYYY-MM-DDTHH:MM, YYYY-MM-DDTHH:MM:SS (with optional .sss),
 * optionally followed by "Z". Rejects impossible dates like 2026-02-30.
 */
export function parseUtcInput(text: string): Result<number> {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?Z?$/.exec(
      text.trim(),
    );
  if (!m) {
    return {
      ok: false,
      reason: 'Use the format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS (UTC).',
    };
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0'] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const ms = Number(frac.padEnd(3, '0'));
  if (hour > 23 || minute > 59 || second > 59) {
    return { ok: false, reason: 'Time of day is not valid.' };
  }
  const t = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(t);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'That calendar date does not exist.' };
  }
  if (!isInSupportedRange(t)) {
    return { ok: false, reason: rangeMessage() };
  }
  return { ok: true, value: t };
}

/** ISO-8601 UTC string without milliseconds, e.g. 2026-10-17T12:30:00Z */
export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Local time with an explicit zone label, e.g. "2026-10-17 18:00:00 GMT+5:30". */
export function formatLocal(ms: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
const zone = get('timeZoneName') === 'GMT+0' ? 'GMT' : get('timeZoneName');
  return (
    `${get('year')}-${get('month')}-${get('day')} ` +
    `${get('hour')}:${get('minute')}:${get('second')} ${zone}`
  );
}
