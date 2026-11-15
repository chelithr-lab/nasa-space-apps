import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_RANGE } from '../core/time.ts';
import type { Result } from '../core/time.ts';
import { makeSyntheticEphemeris } from '../astro/testSupport.ts';
import { computeAstroStateWith } from '../astro/state.ts';
import type { MoonQuarterEvent } from '../astro/ephemeris.ts';
import { SimClock, SPEED_PRESETS } from './simClock.ts';
import { SimStore } from './simStore.ts';
import { buildSnapshot } from './simSnapshot.ts';
import type { SimSnapshot } from './simSnapshot.ts';
import { findNextPhase, findPreviousPhase } from './phaseJump.ts';
import { describeOffset, describeSpeed } from './timeFormat.ts';
import { EARTH_MOON_KM, EARTH_SUN_KM, eclipticToEqj } from './testHelpers.ts';

const T0 = Date.UTC(2026, 9, 19, 12, 0, 0);

function fakeNow(start: number) {
  const ref = { t: start };
  return { ref, now: () => ref.t };
}

// ------------------------------------------------------------- SimClock
test('SimClock starts paused at the real time and does not run until played', () => {
  const { ref, now } = fakeNow(T0);
  const c = new SimClock(now);
  ref.t += 5000;
  assert.equal(c.readSimMs(), T0);
  assert.equal(c.view().playing, false);
});

test('SimClock plays forward, backward and at changed speeds without drift', () => {
  const { ref, now } = fakeNow(T0);
  const c = new SimClock(now);
  c.setSpeed(3600);
  c.play();
  ref.t += 2000;
  assert.equal(c.readSimMs(), T0 + 2 * 3600 * 1000);
  c.setSpeed(-60);
  const before = c.readSimMs();
  ref.t += 10_000;
  assert.equal(c.readSimMs(), before - 600_000);
  c.pause();
  const frozen = c.readSimMs();
  ref.t += 99_999;
  assert.equal(c.readSimMs(), frozen);
});

test('SimClock rejects bad speeds, bad dates and out-of-range dates with messages, and keeps its state', () => {
  const { now } = fakeNow(T0);
  const c = new SimClock(now);
  for (const s of [0, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) assert.equal(c.setSpeed(s).ok, false, `speed ${s}`);
  assert.equal(c.view().speed, 1);
  for (const text of ['', 'tomorrow', '2026-02-30', '1800-01-01', '2500-01-01']) {
    const r = c.setFromUtcText(text);
    assert.equal(r.ok, false, text);
    if (!r.ok) assert.ok(r.reason.length > 5);
  }
  assert.equal(c.readSimMs(), T0);
  assert.equal(c.setFromUtcText('2030-01-01T00:00:00Z').ok, true);
  assert.equal(c.readSimMs(), Date.UTC(2030, 0, 1));
});

test('SimClock stops at the range edge and tells the user', () => {
  const { ref, now } = fakeNow(T0);
  const c = new SimClock(now);
  assert.equal(c.setSimMs(SUPPORTED_RANGE.endMs - 1000).ok, true);
  c.setSpeed(1000);
  c.play();
  ref.t += 60_000;
  assert.equal(c.readSimMs(), SUPPORTED_RANGE.endMs);
  const v = c.view();
  assert.equal(v.playing, false);
  assert.match(v.notice ?? '', /edge of the supported date range/);
  c.clearNotice();
  assert.equal(c.view().notice, null);
});

test('SimClock goToPresent follows real time again and reports live; stepping leaves live', () => {
  const { ref, now } = fakeNow(T0);
  const c = new SimClock(now);
  c.setSimMs(Date.UTC(2040, 5, 1));
  assert.equal(c.view().live, false);
  ref.t += 1000;
  c.goToPresent();
  assert.equal(c.view().live, true);
  ref.t += 5000;
  assert.equal(c.readSimMs(), ref.t);
  assert.equal(c.view().live, true);
  c.stepSeconds(3600);
  assert.equal(c.view().live, false);
  assert.ok(Math.abs(c.view().offsetFromPresentSeconds - 3600) < 1e-6);
});

test('SimClock stepping while playing keeps playing and keeps the speed', () => {
  const { ref, now } = fakeNow(T0);
  const c = new SimClock(now);
  c.setSpeed(60);
  c.play();
  ref.t += 1000;
  c.stepSeconds(-86400);
  const v = c.view();
  assert.equal(v.playing, true);
  assert.equal(v.speed, 60);
  assert.equal(v.simMs, T0 + 60_000 - 86_400_000);
});

test('speed presets are strictly increasing positive numbers with unique labels', () => {
  let last = 0;
  const labels = new Set<string>();
  for (const p of SPEED_PRESETS) {
    assert.ok(p.value > last);
    last = p.value;
    labels.add(p.label);
  }
  assert.equal(labels.size, SPEED_PRESETS.length);
});

// ------------------------------------------------------- phase jumping
function fakeQuarters(events: MoonQuarterEvent[]) {
  return (start: number, count: number): Result<MoonQuarterEvent[]> => ({
    ok: true,
    value: events.filter((e) => e.utcMs > start).slice(0, count),
  });
}
const PHASES: MoonQuarterEvent[] = [
  { quarter: 0, utcMs: Date.UTC(2026, 9, 10, 15, 50) },
  { quarter: 1, utcMs: Date.UTC(2026, 9, 18, 16, 12) },
  { quarter: 2, utcMs: Date.UTC(2026, 9, 26, 4, 12) },
  { quarter: 3, utcMs: Date.UTC(2026, 10, 1, 20, 28) },
  { quarter: 0, utcMs: Date.UTC(2026, 10, 9, 7, 2) },
];

test('phase jump: next and previous pick the neighbouring phases, and repeating from an exact phase moves on', () => {
  const q = fakeQuarters(PHASES);
  const mid = Date.UTC(2026, 9, 20);
  const n = findNextPhase(mid, q);
  assert.ok(n.ok && n.value.quarter === 2);
  const p = findPreviousPhase(mid, q);
  assert.ok(p.ok && p.value.quarter === 1);
  const exact = PHASES[2]!.utcMs;
  const n2 = findNextPhase(exact, q);
  assert.ok(n2.ok && n2.value.quarter === 3, 'from exactly Full Moon the next is Last Quarter');
  const p2 = findPreviousPhase(exact, q);
  assert.ok(p2.ok && p2.value.quarter === 1, 'from exactly Full Moon the previous is First Quarter');
});

test('phase jump: failures from the search are passed through', () => {
  const failing = (): Result<MoonQuarterEvent[]> => ({ ok: false, reason: 'outside the supported range' });
  const n = findNextPhase(T0, failing);
  assert.equal(n.ok, false);
  assert.equal(findPreviousPhase(T0, failing).ok, false);
  assert.equal(findNextPhase(T0, () => ({ ok: true, value: [] })).ok, false);
});

// ------------------------------------------------------------ snapshot
function syntheticCompute(utcMs: number) {
  // Moon at ecliptic longitude 100 deg, latitude 2 deg; Sun on the ecliptic at 10 deg (First Quarter).
  const eph = makeSyntheticEphemeris({
    moonGeoKm: eclipticToEqj(100, 2, EARTH_MOON_KM),
    sunGeoKm: eclipticToEqj(10, 0, EARTH_SUN_KM),
  });
  return computeAstroStateWith(eph, utcMs);
}

test('snapshot: built from the same Stage 2 state; Sun is over the east side at First Quarter', () => {
  const r = buildSnapshot(T0, syntheticCompute);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.utcMs, T0);
  assert.equal(r.value.astro.utcMs, T0);
  assert.ok(r.value.lighting.sunDirMoonFixed.y > 0.99);
  assert.equal(r.value.moonFrame.model, 'approximate: ecliptic pole, zero longitudinal libration');
});

test('snapshot: failures from the astronomy layer become messages, not exceptions', () => {
  const r = buildSnapshot(Date.UTC(2500, 0, 1), syntheticCompute);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /supported range/);
});

// --------------------------------------------------------------- store
function makeStore() {
  const { ref, now } = fakeNow(T0);
  let computeCount = 0;
  const store = new SimStore({
    nowMs: now,
    computeSnapshot: (ms): Result<SimSnapshot> => {
      computeCount++;
      return buildSnapshot(ms, syntheticCompute);
    },
    quarters: fakeQuarters(PHASES),
    uiIntervalMs: 100,
  });
  return { ref, store, count: () => computeCount };
}

test('store: while paused, repeated ticks do not recompute and the UI snapshot keeps its identity', () => {
  const { ref, store, count } = makeStore();
  const first = store.getUiSnapshot();
  const computedAtStart = count();
  for (let i = 0; i < 50; i++) {
    ref.t += 16;
    store.tick();
  }
  assert.equal(count(), computedAtStart);
  assert.equal(store.getUiSnapshot(), first, 'same object: required by useSyncExternalStore');
});

test('store: playing recomputes each time the time changes, and UI updates are throttled', () => {
  const { ref, store, count } = makeStore();
  let uiNotifications = 0;
  store.subscribeUi(() => {
    uiNotifications++;
  });
  let frames = 0;
  store.subscribeFrame(() => {
    frames++;
  });
  frames = 0; // ignore the immediate delivery to a new listener
  store.setSpeed(3600);
  store.play();
  const uiAfterActions = uiNotifications;
  const computed0 = count();
  for (let i = 0; i < 60; i++) {
    ref.t += 16; // about one second of 60 fps frames
    store.tick();
  }
  assert.equal(count() - computed0, 60);
  assert.equal(frames, 60);
  const uiDuringPlayback = uiNotifications - uiAfterActions;
  assert.ok(uiDuringPlayback >= 8 && uiDuringPlayback <= 11, `UI notified ${uiDuringPlayback} times in ~1 s`);
});

test('store: while playing, the UI shows the same simulation time that the scenes were computed for', () => {
  // The fake real clock advances 7 ms on EVERY read, like a real clock does between two reads.
  const ref = { t: T0 };
  const store = new SimStore({
    nowMs: () => (ref.t += 7),
    computeSnapshot: (ms) => buildSnapshot(ms, syntheticCompute),
    quarters: fakeQuarters(PHASES),
    uiIntervalMs: 0,
  });
  store.setSpeed(86400);
  store.play();
  for (let i = 0; i < 20; i++) {
    store.tick();
    const ui = store.getUiSnapshot();
    assert.equal(ui.clock.simMs, store.getFrame().simMs, `tick ${i}`);
    assert.equal(ui.snapshot?.utcMs, ui.clock.simMs);
  }
});

test('store: an invalid date shows an error and leaves the time unchanged; a valid one clears it', () => {
  const { store } = makeStore();
  const t = store.getFrame().simMs;
  store.setFromUtcText('2026-02-30');
  assert.match(store.getUiSnapshot().actionError ?? '', /does not exist/);
  assert.equal(store.getFrame().simMs, t);
  store.setFromUtcText('2031-03-04T05:06:07Z');
  assert.equal(store.getUiSnapshot().actionError, null);
  assert.equal(store.getFrame().simMs, Date.UTC(2031, 2, 4, 5, 6, 7));
});

test('store: phase jumps move the shared time to the phase instant; both consumers see it', () => {
  const { store } = makeStore();
  store.setSimMs(Date.UTC(2026, 9, 20));
  store.jumpToNextPhase();
  assert.equal(store.getFrame().simMs, PHASES[2]!.utcMs);
  assert.equal(store.getUiSnapshot().clock.simMs, PHASES[2]!.utcMs);
  store.jumpToPreviousPhase();
  assert.equal(store.getFrame().simMs, PHASES[1]!.utcMs);
});

test('store: goToPresent returns to the real clock and a computation failure keeps the last good snapshot', () => {
  const { ref, now } = fakeNow(T0);
  let fail = false;
  const store = new SimStore({
    nowMs: now,
    computeSnapshot: (ms) => (fail ? { ok: false, reason: 'ephemeris unavailable' } : buildSnapshot(ms, syntheticCompute)),
    quarters: fakeQuarters(PHASES),
  });
  const good = store.getFrame().snapshot;
  assert.ok(good !== null);
  fail = true;
  store.setSimMs(Date.UTC(2030, 0, 1));
  assert.equal(store.getFrame().snapshot, good, 'last good snapshot kept');
  assert.equal(store.getFrame().computeError, 'ephemeris unavailable');
  assert.equal(store.getUiSnapshot().computeError, 'ephemeris unavailable');
  fail = false;
  ref.t += 1000;
  store.goToPresent();
  assert.equal(store.getFrame().simMs, ref.t);
  assert.equal(store.getFrame().computeError, null);
  assert.equal(store.getUiSnapshot().clock.live, true);
});

test('store: unsubscribed listeners are not called; new frame listeners get the current state at once', () => {
  const { store } = makeStore();
  let calls = 0;
  const off = store.subscribeFrame(() => {
    calls++;
  });
  assert.equal(calls, 1);
  off();
  store.setSimMs(Date.UTC(2027, 0, 1));
  assert.equal(calls, 1);
});

// ------------------------------------------------------- time formatting
test('describeOffset and describeSpeed', () => {
  assert.equal(describeOffset(0), 'in sync with real time');
  assert.equal(describeOffset(1.9), 'in sync with real time');
  assert.equal(describeOffset(90), '+00:01:30 (future)');
  assert.equal(describeOffset(-600), '-00:10:00 (past)');
  assert.equal(describeOffset(2 * 86400 + 3 * 3600 + 4 * 60 + 5), '+2 d 03:04:05 (future)');
  assert.equal(describeOffset(-400 * 86400), '-1.10 years (past)');
  assert.equal(describeOffset(Number.NaN), 'unknown');
  assert.equal(describeSpeed(1), 'real time');
  assert.equal(describeSpeed(-1), 'backwards real time');
  assert.equal(describeSpeed(3600), '1 h / s');
  assert.equal(describeSpeed(86400 * 10), '10 d / s');
  assert.equal(describeSpeed(60), '1 min / s');
});
