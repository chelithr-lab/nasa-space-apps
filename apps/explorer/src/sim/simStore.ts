/**
 * The single shared simulation store: one clock, one snapshot per instant,
 * read by BOTH 3D views and by the interface.
 *
 * - `tick()` reads the clock (Stage 1), recomputes the snapshot only when the
 *   simulation time actually changed, then notifies "frame" listeners (the 3D
 *   scenes, every animation frame) and, at a limited rate, "UI" listeners
 *   (React).
 * - `getUiSnapshot()` returns the SAME object until something visible
 *   changes. React's useSyncExternalStore requires this; a new object on
 *   every call would cause an endless render loop (a test guards it).
 * - Cameras never touch this store, so moving a camera cannot change the
 *   astronomical state.
 */
import type { Result } from '../core/time.ts';
import { SimClock } from './simClock.ts';
import type { ClockView } from './simClock.ts';
import { findNextPhase, findPreviousPhase } from './phaseJump.ts';
import type { QuartersFn } from './phaseJump.ts';
import type { SimSnapshot } from './simSnapshot.ts';

export interface FrameData {
  simMs: number;
  /** Latest successfully computed snapshot for simMs, or null if none could be computed. */
  snapshot: SimSnapshot | null;
  /** Why the snapshot could not be computed (null when it could). */
  computeError: string | null;
}

export interface UiSnapshot {
  clock: ClockView;
  snapshot: SimSnapshot | null;
  computeError: string | null;
  /** Message from the last rejected action (for example an invalid date); null when none. */
  actionError: string | null;
}

export interface SimStoreOptions {
  nowMs: () => number;
  computeSnapshot: (utcMs: number) => Result<SimSnapshot>;
  quarters: QuartersFn;
  /** Minimum real milliseconds between UI notifications during playback. */
  uiIntervalMs?: number;
}

type Listener = () => void;
type FrameListener = (data: FrameData) => void;

export class SimStore {
  readonly clock: SimClock;
  private readonly nowMs: () => number;
  private readonly computeSnapshot: (utcMs: number) => Result<SimSnapshot>;
  private readonly quarters: QuartersFn;
  private readonly uiIntervalMs: number;

  private frame: FrameData = { simMs: Number.NaN, snapshot: null, computeError: null };
  private lastGood: SimSnapshot | null = null;
  private computedForMs: number = Number.NaN;
  private ui: UiSnapshot;
  private uiDirty = true;
  private lastUiPublishRealMs = Number.NEGATIVE_INFINITY;
  private actionError: string | null = null;

  private readonly frameListeners = new Set<FrameListener>();
  private readonly uiListeners = new Set<Listener>();
  private rafId: number | null = null;

  constructor(options: SimStoreOptions) {
    this.nowMs = options.nowMs;
    this.computeSnapshot = options.computeSnapshot;
    this.quarters = options.quarters;
    this.uiIntervalMs = options.uiIntervalMs ?? 100;
    this.clock = new SimClock(options.nowMs);
    this.ui = { clock: this.clock.view(), snapshot: null, computeError: null, actionError: null };
    this.tick();
  }

  // ---------------------------------------------------------------- reading

  /** Stable between changes (required by useSyncExternalStore). */
  getUiSnapshot = (): UiSnapshot => this.ui;

  subscribeUi = (listener: Listener): (() => void) => {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  };

  subscribeFrame = (listener: FrameListener): (() => void) => {
    this.frameListeners.add(listener);
    listener(this.frame); // new listeners get the current state immediately
    return () => {
      this.frameListeners.delete(listener);
    };
  };

  getFrame(): FrameData {
    return this.frame;
  }

  // ------------------------------------------------------------------- loop

  /** Advance one step: read the clock, recompute if the time changed, notify. */
  tick(): void {
    const realNow = this.nowMs();
    const simMs = this.clock.readSimMs();
    let changed = false;

    if (simMs !== this.computedForMs) {
      const r = this.computeSnapshot(simMs);
      if (r.ok) this.lastGood = r.value;
      this.computedForMs = simMs;
      this.frame = {
        simMs,
        snapshot: r.ok ? r.value : this.lastGood,
        computeError: r.ok ? null : r.reason,
      };
      changed = true;
      this.uiDirty = true;
    }

    if (changed) for (const l of this.frameListeners) l(this.frame);

    if (this.uiDirty && realNow - this.lastUiPublishRealMs >= this.uiIntervalMs) this.publishUi(realNow);
  }

  start(): void {
    if (this.rafId !== null || typeof globalThis.requestAnimationFrame !== 'function') return;
    const loop = (): void => {
      this.tick();
      this.rafId = globalThis.requestAnimationFrame(loop);
    };
    this.rafId = globalThis.requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  // ---------------------------------------------------------------- actions

  private publishUi(realNow: number): void {
    // The displayed time must be the time the scenes were computed for, not a later clock reading.
    const v = this.clock.view();
    this.ui = {
      clock: { ...v, simMs: this.frame.simMs, offsetFromPresentSeconds: (this.frame.simMs - realNow) / 1000 },
      snapshot: this.frame.snapshot,
      computeError: this.frame.computeError,
      actionError: this.actionError,
    };
    this.uiDirty = false;
    this.lastUiPublishRealMs = realNow;
    for (const l of this.uiListeners) l();
  }

  /** After a user action: recompute at once and notify immediately (no throttling). */
  private afterAction(result: Result<unknown> | null): void {
    this.actionError = result !== null && !result.ok ? result.reason : null;
    this.uiDirty = true;
    this.lastUiPublishRealMs = Number.NEGATIVE_INFINITY;
    this.tick();
    if (this.uiDirty) this.publishUi(this.nowMs());
  }

  play = (): void => {
    this.clock.play();
    this.afterAction(null);
  };

  pause = (): void => {
    this.clock.pause();
    this.afterAction(null);
  };

  /** Signed speed in simulated seconds per real second. */
  setSpeed = (speed: number): void => {
    this.afterAction(this.clock.setSpeed(speed));
  };

  stepSeconds = (deltaSeconds: number): void => {
    this.afterAction(this.clock.stepSeconds(deltaSeconds));
  };

  setFromUtcText = (text: string): void => {
    this.afterAction(this.clock.setFromUtcText(text));
  };

  setSimMs = (utcMs: number): void => {
    this.afterAction(this.clock.setSimMs(utcMs));
  };

  goToPresent = (): void => {
    this.clock.goToPresent();
    this.afterAction(null);
  };

  jumpToNextPhase = (): void => {
    const e = findNextPhase(this.clock.readSimMs(), this.quarters);
    this.afterAction(e.ok ? this.clock.setSimMs(e.value.utcMs) : e);
  };

  jumpToPreviousPhase = (): void => {
    const e = findPreviousPhase(this.clock.readSimMs(), this.quarters);
    this.afterAction(e.ok ? this.clock.setSimMs(e.value.utcMs) : e);
  };

  dismissMessages = (): void => {
    this.clock.clearNotice();
    this.afterAction(null);
  };
}
