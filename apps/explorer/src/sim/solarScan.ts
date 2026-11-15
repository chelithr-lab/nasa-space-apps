/**
 * Scanning a site through time: sampled solar states with extra samples at every
 * transition, solar EVENTS (sunrise, sunset, terrain-shadow edges, eclipse edges,
 * elevation extremes) and a plain-language summary of the daylight cycle.
 *
 * Method (efficient and honest about its limits):
 *   1. Evaluate the site every `stepMs` (coarse: at most 30 minutes).
 *   2. Wherever two neighbouring samples differ in lighting state (Sun above the
 *      horizon, terrain-blocked, eclipsed, directly lit), bisect until the
 *      transition is bracketed to `refineMs` (1 second by default) and keep both
 *      bracketing samples. So energy integration sees each edge precisely.
 *   3. Local maxima/minima of the Sun's elevation are refined by a ternary search.
 *
 * LIMITATION (stated in the interface): a lit or dark interval that starts AND
 * ends between two neighbouring coarse samples (shorter than the step) is not
 * seen. With this step (<= 30 min) and a 1 degree terrain horizon grid, the
 * Sun moves about 0.25 degrees per step, so such intervals can only come from
 * features the raster cannot resolve anyway.
 */
import { mulMat3Vec3, scale } from '../astro/vec3.ts';
import type { Result } from '../core/time.ts';
import type { SimSnapshot } from './simSnapshot.ts';
import { evaluateSite } from './solarSite.ts';
import type { SiteModel, SiteSolarState, SunSample } from './solarSite.ts';

/** Returns the Sun/Earth state for an instant, or null if it cannot be computed (for example outside the supported date range). */
export type SunSampler = (utcMs: number) => SunSample | null;

export const MAX_COARSE_STEP_MS = 30 * 60_000;
export const MIN_COARSE_STEP_MS = 60_000;
export const DEFAULT_REFINE_MS = 1000;

/** Coarse step for a span: about 400 samples, never finer than 1 min nor coarser than 30 min. */
export function chooseStepMs(spanMs: number): number {
  return Math.min(MAX_COARSE_STEP_MS, Math.max(MIN_COARSE_STEP_MS, Math.round(spanMs / 400 / 1000) * 1000));
}

export function sunSampleFromSnapshot(snap: SimSnapshot): SunSample {
  const a = snap.astro.fromMoon;
  const earthDirFixed = mulMat3Vec3(snap.moonFrame.eqjToMoonFixed, a.earthDirEqj);
  return {
    utcMs: snap.utcMs,
    sunDirFixed: snap.lighting.sunDirMoonFixed,
    sunDistanceAu: a.sunDistanceKm / 149_597_870.7,
    earthVecFixedKm: scale(earthDirFixed, a.earthDistanceKm),
  };
}

/** A sampler backed by the app's snapshot function (the same astronomy and frame the Moon scene uses). */
export function samplerFromSnapshots(computeSnapshot: (utcMs: number) => Result<SimSnapshot>): SunSampler {
  return (utcMs) => {
    const r = computeSnapshot(utcMs);
    return r.ok ? sunSampleFromSnapshot(r.value) : null;
  };
}

export interface ScanControl {
  /** Set to true to abandon the scan (a newer one has replaced it). */
  cancelled: boolean;
}

export interface ScanOptions {
  stepMs?: number;
  refineMs?: number;
  control?: ScanControl;
  onProgress?: (fraction: number) => void;
  /** Real milliseconds of work between pauses that let the page stay responsive (default 25). */
  sliceMs?: number;
}

export interface SiteScan {
  readonly t0: number;
  readonly t1: number;
  readonly stepMs: number;
  readonly refineMs: number;
  /** Time-ordered states, including bracketing samples at each transition. */
  readonly states: readonly SiteSolarState[];
  /** Only the evenly spaced coarse samples (used to find elevation extremes). */
  readonly coarseStates: readonly SiteSolarState[];
  readonly coarseSamples: number;
  readonly refinementSamples: number;
  readonly cancelled: boolean;
}

export class SunUnavailableError extends Error {
  readonly utcMs: number;
  constructor(utcMs: number) {
    super('The Sun position could not be computed for this time (outside the supported date range?).');
    this.name = 'SunUnavailableError';
    this.utcMs = utcMs;
  }
}

function signature(s: SiteSolarState): number {
  return (s.geometricSunUp ? 1 : 0) | (s.terrainBlocked ? 2 : 0) | (s.eclipseCovered > 0 ? 4 : 0) | (s.directSunlight ? 8 : 0);
}

function nowRealMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Evaluate the site at an instant, or throw SunUnavailableError. */
export function stateAt(site: SiteModel, sampler: SunSampler, utcMs: number, rateDegPerHour: number | null = null): SiteSolarState {
  const s = sampler(utcMs);
  if (s === null) throw new SunUnavailableError(utcMs);
  return evaluateSite(site, s, rateDegPerHour);
}

/** Elevation change rate (degrees per hour) from a 2-minute central difference; null if either end is unavailable. */
export function elevationRate(site: SiteModel, sampler: SunSampler, utcMs: number): number | null {
  const dt = 60_000;
  const a = sampler(utcMs - dt);
  const b = sampler(utcMs + dt);
  if (a === null || b === null) return null;
  const ea = evaluateSite(site, a).elevationDeg;
  const eb = evaluateSite(site, b).elevationDeg;
  return ((eb - ea) / (2 * dt)) * 3_600_000;
}

/** Scan [t0, t1]. Yields to the event loop so the page stays responsive; rejects with SunUnavailableError if a sample fails. */
export async function scanSite(site: SiteModel, sampler: SunSampler, t0: number, t1: number, options: ScanOptions = {}): Promise<SiteScan> {
  if (!(t1 > t0)) throw new RangeError('The scan end must be after its start.');
  const refineMs = options.refineMs ?? DEFAULT_REFINE_MS;
  const stepMs = options.stepMs ?? chooseStepMs(t1 - t0);
  const sliceMs = options.sliceMs ?? 25;
  const control = options.control;

  const count = Math.max(1, Math.ceil((t1 - t0) / stepMs));
  const coarse: SiteSolarState[] = [];
  let sliceStart = nowRealMs();
  const checkpoint = async (fraction: number): Promise<boolean> => {
    if (nowRealMs() - sliceStart >= sliceMs) {
      options.onProgress?.(fraction);
      await pause();
      sliceStart = nowRealMs();
    }
    return control?.cancelled === true;
  };

  for (let i = 0; i <= count; i++) {
    const t = i === count ? t1 : t0 + i * stepMs;
    coarse.push(stateAt(site, sampler, t));
    if (await checkpoint((i / count) * 0.6)) return emptyScan(t0, t1, stepMs, refineMs, coarse.length);
  }

  const all: SiteSolarState[] = [];
  let refined = 0;
  for (let i = 0; i < coarse.length; i++) {
    const a = coarse[i] as SiteSolarState;
    all.push(a);
    const b = coarse[i + 1];
    if (b === undefined) break;
    if (signature(a) === signature(b)) continue;
    let cur = a;
    for (let guard = 0; guard < 8 && signature(cur) !== signature(b); guard++) {
      let lo = cur;
      let hi = b;
      const sigLo = signature(cur);
      while (hi.utcMs - lo.utcMs > refineMs) {
        const mid = stateAt(site, sampler, Math.round((lo.utcMs + hi.utcMs) / 2));
        refined++;
        if (signature(mid) === sigLo) lo = mid;
        else hi = mid;
      }
      if (lo !== cur) all.push(lo);
      if (hi !== b) all.push(hi);
      cur = hi;
      if (cur === b) break;
    }
    if (await checkpoint(0.6 + (i / coarse.length) * 0.4)) return emptyScan(t0, t1, stepMs, refineMs, coarse.length);
  }
  options.onProgress?.(1);
  all.sort((p, q) => p.utcMs - q.utcMs);
  const unique = all.filter((s, i) => i === 0 || s.utcMs > (all[i - 1] as SiteSolarState).utcMs);
  return { t0, t1, stepMs, refineMs, states: unique, coarseStates: coarse, coarseSamples: coarse.length, refinementSamples: refined, cancelled: false };
}

function emptyScan(t0: number, t1: number, stepMs: number, refineMs: number, coarse: number): SiteScan {
  return { t0, t1, stepMs, refineMs, states: [], coarseStates: [], coarseSamples: coarse, refinementSamples: 0, cancelled: true };
}

// -------------------------------------------------------------------- events

export type SolarEventKind =
  | 'sunrise'
  | 'sunset'
  | 'terrain-shadow-start'
  | 'terrain-shadow-end'
  | 'eclipse-start'
  | 'eclipse-end'
  | 'max-elevation'
  | 'min-elevation';

export const EVENT_LABEL: Readonly<Record<SolarEventKind, string>> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  'terrain-shadow-start': 'Terrain shadow begins',
  'terrain-shadow-end': 'Terrain shadow ends (light returns)',
  'eclipse-start': 'Earth begins to cover the Sun',
  'eclipse-end': 'Earth stops covering the Sun',
  'max-elevation': 'Maximum Sun elevation',
  'min-elevation': 'Minimum Sun elevation',
};

export interface SolarEvent {
  readonly kind: SolarEventKind;
  readonly utcMs: number;
  /** Sun centre elevation at the event, degrees (for sunrise/sunset about 0). */
  readonly elevationDeg: number;
}

/**
 * Events from a scan. The time of an edge is the midpoint of its bracket
 * (within refineMs / 2 of the true transition, 0.5 s by default).
 */
export function extractEvents(scan: SiteScan, site: SiteModel, sampler: SunSampler): SolarEvent[] {
  const events: SolarEvent[] = [];
  const st = scan.states;
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1] as SiteSolarState;
    const b = st[i] as SiteSolarState;
    const t = Math.round((a.utcMs + b.utcMs) / 2);
    const el = (a.elevationDeg + b.elevationDeg) / 2;
    if (a.geometricSunUp !== b.geometricSunUp) events.push({ kind: b.geometricSunUp ? 'sunrise' : 'sunset', utcMs: t, elevationDeg: el });
    // A terrain edge only counts while the Sun is already above the geometric horizon (otherwise it is the sunrise/sunset itself).
    if (a.geometricSunUp && b.geometricSunUp && a.terrainBlocked !== b.terrainBlocked) events.push({ kind: b.terrainBlocked ? 'terrain-shadow-start' : 'terrain-shadow-end', utcMs: t, elevationDeg: el });
    if (a.eclipseCovered > 0 !== b.eclipseCovered > 0) events.push({ kind: b.eclipseCovered > 0 ? 'eclipse-start' : 'eclipse-end', utcMs: t, elevationDeg: el });
  }

  // Elevation extremes: local extremes among the COARSE samples only, then refined.
  const coarse = scan.coarseStates;
  for (let i = 1; i < coarse.length - 1; i++) {
    const p = coarse[i - 1] as SiteSolarState;
    const c = coarse[i] as SiteSolarState;
    const n = coarse[i + 1] as SiteSolarState;
    const isMax = c.elevationDeg > p.elevationDeg && c.elevationDeg >= n.elevationDeg;
    const isMin = c.elevationDeg < p.elevationDeg && c.elevationDeg <= n.elevationDeg;
    if (!isMax && !isMin) continue;
    const sign = isMax ? 1 : -1;
    let lo = p.utcMs;
    let hi = n.utcMs;
    const f = (t: number): number => sign * stateAt(site, sampler, t).elevationDeg;
    for (let k = 0; k < 28 && hi - lo > 1000; k++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) lo = m1;
      else hi = m2;
    }
    const tBest = Math.round((lo + hi) / 2);
    events.push({ kind: isMax ? 'max-elevation' : 'min-elevation', utcMs: tBest, elevationDeg: stateAt(site, sampler, tBest).elevationDeg });
  }
  events.sort((x, y) => x.utcMs - y.utcMs);
  return events;
}

export function nextEvent(events: readonly SolarEvent[], utcMs: number, kinds?: readonly SolarEventKind[]): SolarEvent | null {
  for (const e of events) if (e.utcMs > utcMs && (kinds === undefined || kinds.includes(e.kind))) return e;
  return null;
}

export function previousEvent(events: readonly SolarEvent[], utcMs: number, kinds?: readonly SolarEventKind[]): SolarEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as SolarEvent;
    if (e.utcMs <= utcMs && (kinds === undefined || kinds.includes(e.kind))) return e;
  }
  return null;
}

export interface DaylightSummary {
  /** Milliseconds since the last sunrise, if the Sun is up and that sunrise was found in the window. */
  sinceSunriseMs: number | null;
  untilSunsetMs: number | null;
  untilSunriseMs: number | null;
  /** Plain-language note when something could not be determined. */
  note: string | null;
}

/**
 * Daylight-cycle summary at `utcMs`. Never invents a countdown: anything that
 * lies outside the scanned window is reported as unknown, with a reason.
 */
export function summariseDaylight(events: readonly SolarEvent[], scan: SiteScan, current: SiteSolarState): DaylightSummary {
  const t = current.utcMs;
  const inWindow = t >= scan.t0 && t <= scan.t1;
  if (!inWindow) return { sinceSunriseMs: null, untilSunsetMs: null, untilSunriseMs: null, note: 'The current time is outside the calculated window.' };
  const rise = ['sunrise'] as const;
  const set = ['sunset'] as const;
  const lastRise = previousEvent(events, t, rise);
  const nextSet = nextEvent(events, t, set);
  const nextRise = nextEvent(events, t, rise);
  const windowEnd = new Date(scan.t1).toISOString().slice(0, 16).replace('T', ' ');
  if (current.geometricSunUp) {
    const since = lastRise === null ? null : t - lastRise.utcMs;
    const until = nextSet === null ? null : nextSet.utcMs - t;
    let note: string | null = null;
    if (nextSet === null) note = `No sunset found before ${windowEnd} UTC (the Sun may stay up longer than the calculated window, as near the poles).`;
    else if (lastRise === null) note = 'The last sunrise is before the calculated window.';
    return { sinceSunriseMs: since, untilSunsetMs: until, untilSunriseMs: null, note };
  }
  const until = nextRise === null ? null : nextRise.utcMs - t;
  return {
    sinceSunriseMs: null,
    untilSunsetMs: null,
    untilSunriseMs: until,
    note: nextRise === null ? `No sunrise found before ${windowEnd} UTC (the night may be longer than the calculated window).` : null,
  };
}
