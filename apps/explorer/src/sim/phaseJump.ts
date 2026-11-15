/**
 * Jump to the next or previous principal lunar phase (New, First Quarter,
 * Full, Last Quarter) using the Stage 2 phase search, injected as `quarters`.
 */
import type { Result } from '../core/time.ts';
import type { MoonQuarterEvent } from '../astro/ephemeris.ts';

export type QuartersFn = (startUtcMs: number, count: number) => Result<MoonQuarterEvent[]>;

export const QUARTER_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'] as const;

/** Margin so that jumping from exactly a phase instant moves to the following one. */
const MARGIN_MS = 60_000;
const DAY_MS = 86_400_000;

export function findNextPhase(simMs: number, quarters: QuartersFn): Result<MoonQuarterEvent> {
  const r = quarters(simMs + MARGIN_MS, 1);
  if (!r.ok) return r;
  const first = r.value[0];
  if (first === undefined) return { ok: false, reason: 'No later lunar phase was found.' };
  return { ok: true, value: first };
}

export function findPreviousPhase(simMs: number, quarters: QuartersFn): Result<MoonQuarterEvent> {
  // Phases are about 7.4 days apart, so a 10-day look-back always contains one; ask for several.
  const r = quarters(simMs - 10 * DAY_MS, 5);
  if (!r.ok) return r;
  let best: MoonQuarterEvent | undefined;
  for (const e of r.value) {
    if (e.utcMs < simMs - MARGIN_MS && (best === undefined || e.utcMs > best.utcMs)) best = e;
  }
  if (best === undefined) return { ok: false, reason: 'No earlier lunar phase was found.' };
  return { ok: true, value: best };
}
