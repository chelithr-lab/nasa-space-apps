import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_RANGE,
  createClock,
  readClock,
  setSimTime,
  play,
  pause,
  setSpeed,
  stepBy,
  returnToPresent,
  offsetFromPresentSeconds,
  parseUtcInput,
  formatUtc,
  formatLocal,
  isInSupportedRange,
} from './time.ts';

const T0 = Date.UTC(2026, 9, 17, 12, 30, 0); // 2026-10-17T12:30:00Z

function ok<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  assert.equal(r.ok, true, r.ok ? '' : r.reason);
  return (r as { ok: true; value: T }).value;
}

test('new clock shows the real time and is paused', () => {
  const c = createClock(T0);
  assert.equal(readClock(c, T0 + 5000).simMs, T0);
  assert.equal(c.playing, false);
});

test('playing at speed 1 advances one sim second per real second', () => {
  const c = play(createClock(T0), T0);
  assert.equal(readClock(c, T0 + 10_000).simMs, T0 + 10_000);
});

test('speed 3600 advances one hour per real second', () => {
  let c = createClock(T0);
  c = ok(setSpeed(c, 3600, T0));
  c = play(c, T0);
  assert.equal(readClock(c, T0 + 2000).simMs, T0 + 2 * 3600 * 1000);
});

test('no drift: result depends only on elapsed real time, not on number of reads', () => {
  const c = play(ok(setSpeed(createClock(T0), 86400, T0)), T0);
  let last = 0;
  for (let i = 1; i <= 100_000; i++) {
    last = readClock(c, T0 + i * 16).simMs; // ~60 fps frames
  }
  const direct = readClock(c, T0 + 100_000 * 16).simMs;
  assert.equal(last, direct);
});

test('pause freezes the time exactly', () => {
  let c = play(createClock(T0), T0);
  c = pause(c, T0 + 4000);
  assert.equal(readClock(c, T0 + 999_999).simMs, T0 + 4000);
});

test('changing speed while playing is continuous (no jump)', () => {
  let c = play(createClock(T0), T0);
  const before = readClock(c, T0 + 3000).simMs;
  c = ok(setSpeed(c, 1000, T0 + 3000));
  assert.equal(readClock(c, T0 + 3000).simMs, before);
  assert.equal(readClock(c, T0 + 4000).simMs, before + 1000 * 1000);
});

test('negative speed plays backwards', () => {
  let c = ok(setSpeed(createClock(T0), -60, T0));
  c = play(c, T0);
  assert.equal(readClock(c, T0 + 1000).simMs, T0 - 60_000);
});

test('zero or invalid speed is rejected', () => {
  const c = createClock(T0);
  assert.equal(setSpeed(c, 0, T0).ok, false);
  assert.equal(setSpeed(c, Number.NaN, T0).ok, false);
});

test('step forward then back returns to the same time', () => {
  let c = createClock(T0);
  c = ok(stepBy(c, 3600, T0));
  c = ok(stepBy(c, -3600, T0));
  assert.equal(readClock(c, T0).simMs, T0);
});

test('setSimTime rejects out-of-range and non-finite times', () => {
  const c = createClock(T0);
  const r1 = setSimTime(c, SUPPORTED_RANGE.endMs + 1, T0);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.reason, /supported range/);
  assert.equal(setSimTime(c, SUPPORTED_RANGE.startMs - 1, T0).ok, false);
  assert.equal(setSimTime(c, Number.NaN, T0).ok, false);
});

test('playback stops at the range boundary and reports it', () => {
  const near = SUPPORTED_RANGE.endMs - 1000;
  let c = ok(setSimTime(createClock(T0), near, T0));
  c = play(ok(setSpeed(c, 10, T0)), T0);
  const r = readClock(c, T0 + 60_000);
  assert.equal(r.simMs, SUPPORTED_RANGE.endMs);
  assert.equal(r.hitBoundary, true);
});

test('return to present restores real time and keeps it separate from simulation time', () => {
  let c = ok(setSimTime(createClock(T0), Date.UTC(2030, 0, 1), T0));
  assert.ok(offsetFromPresentSeconds(c, T0) > 0);
  const later = T0 + 60_000;
  c = returnToPresent(later);
  assert.equal(readClock(c, later).simMs, later);
  assert.equal(offsetFromPresentSeconds(c, later), 0);
  assert.equal(c.playing, false);
});

test('parseUtcInput accepts valid forms', () => {
  assert.equal(ok(parseUtcInput('2026-10-17')), Date.UTC(2026, 9, 17));
  assert.equal(ok(parseUtcInput('2026-10-17T12:30')), T0);
  assert.equal(ok(parseUtcInput('2026-10-17T12:30:00Z')), T0);
  assert.equal(ok(parseUtcInput(' 2026-10-17 12:30:00 ')), T0);
});

test('parseUtcInput rejects bad input with a message', () => {
  for (const bad of ['', 'tomorrow', '2026-13-01', '2026-02-30', '2026-10-17T25:00', '2026-10-17T12:60']) {
    const r = parseUtcInput(bad);
    assert.equal(r.ok, false, `should reject "${bad}"`);
    if (!r.ok) assert.ok(r.reason.length > 5);
  }
});

test('parseUtcInput rejects dates outside the supported range', () => {
  assert.equal(parseUtcInput('1800-01-01').ok, false);
  assert.equal(parseUtcInput('2500-01-01').ok, false);
});

test('range check helper', () => {
  assert.equal(isInSupportedRange(T0), true);
  assert.equal(isInSupportedRange(Number.POSITIVE_INFINITY), false);
});

test('formatUtc is ISO and ends with Z', () => {
  assert.equal(formatUtc(T0), '2026-10-17T12:30:00Z');
});

test('formatLocal converts UTC to a labelled local time', () => {
  assert.equal(formatLocal(T0, 'Asia/Colombo'), '2026-10-17 18:00:00 GMT+5:30');
  assert.equal(formatLocal(T0, 'UTC'), '2026-10-17 12:30:00 GMT');
});
