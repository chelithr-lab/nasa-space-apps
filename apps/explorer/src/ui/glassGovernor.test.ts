import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_SLOW_MS,
  EMPTY_STATS,
  FrameWindow,
  GLASS_COST_MS,
  MAX_VALID_FRAME_MS,
  MIN_GLASS_FRAMES,
  decideGlass,
  parseGlassMode,
  percentile,
  type FrameStats,
} from './glassGovernor.ts';

const stats = (frames: number, p95: number): FrameStats => ({ frames, median: p95, p95 });

test('percentile: nearest rank on a known list, input not modified', () => {
  const v = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
  assert.equal(percentile(v, 50), 5);
  assert.equal(percentile(v, 95), 10);
  assert.equal(percentile(v, 100), 10);
  assert.equal(percentile(v, 10), 1);
  assert.deepEqual(v, [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]);
  assert.equal(percentile([7], 95), 7);
});

test('percentile: rejects an empty list and a bad p', () => {
  assert.throws(() => percentile([], 50), RangeError);
  assert.throws(() => percentile([1], 0), RangeError);
  assert.throws(() => percentile([1], 101), RangeError);
});

test('FrameWindow: rolls over at its size and drops unusable intervals', () => {
  const w = new FrameWindow(5);
  for (let i = 1; i <= 8; i++) assert.equal(w.push(i), true);
  assert.equal(w.count, 5);
  assert.equal(w.stats().median, 6); // holds 4..8
  assert.equal(w.push(0), false);
  assert.equal(w.push(-3), false);
  assert.equal(w.push(Number.NaN), false);
  assert.equal(w.push(Number.POSITIVE_INFINITY), false);
  assert.equal(w.push(MAX_VALID_FRAME_MS + 1), false); // a hidden tab is not rendering cost
  assert.equal(w.push(MAX_VALID_FRAME_MS), true);
  assert.equal(w.count, 5);
  w.reset();
  assert.equal(w.count, 0);
  assert.deepEqual(w.stats(), EMPTY_STATS);
});

test('FrameWindow: rejects a bad size', () => {
  assert.throws(() => new FrameWindow(0), RangeError);
  assert.throws(() => new FrameWindow(2.5), RangeError);
});

test('modes on and off ignore the measurements', () => {
  const slow = stats(200, 80);
  const fast = stats(200, 8);
  assert.equal(decideGlass({ mode: 'on', current: 'solid', glass: slow, baseline: null }), 'glass');
  assert.equal(decideGlass({ mode: 'off', current: 'glass', glass: fast, baseline: null }), 'solid');
});

test('auto: stays glass until enough glass frames exist', () => {
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(MIN_GLASS_FRAMES - 1, 90), baseline: null }), 'glass');
});

test('auto: a fast glass window keeps glass, with or without a baseline', () => {
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, ABSOLUTE_SLOW_MS), baseline: null }), 'glass');
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 17), baseline: stats(120, 16) }), 'glass');
});

test('auto, no baseline: a slow glass window switches to solid', () => {
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, ABSOLUTE_SLOW_MS + 0.1), baseline: null }), 'solid');
  // a baseline with too few frames is ignored
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 30), baseline: stats(10, 29) }), 'solid');
});

test('auto, with baseline: glass is blamed only if it adds at least the cost threshold', () => {
  // the Moon alone is slow, glass adds little: keep glass
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 34), baseline: stats(120, 33) }), 'glass');
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 30), baseline: stats(120, 30 - GLASS_COST_MS + 0.5) }), 'glass');
  // glass adds the threshold or more: solid
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 30), baseline: stats(120, 30 - GLASS_COST_MS) }), 'solid');
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: stats(120, 40), baseline: stats(120, 17) }), 'solid');
});

test('auto: once solid it stays solid, even if frames recover', () => {
  assert.equal(decideGlass({ mode: 'auto', current: 'solid', glass: stats(120, 10), baseline: stats(120, 10) }), 'solid');
});

test('end to end: a window of mostly fast frames with a few slow ones keeps glass; a mostly slow one does not', () => {
  const ok = new FrameWindow();
  for (let i = 0; i < 114; i++) ok.push(16.7);
  for (let i = 0; i < 6; i++) ok.push(60); // 5 percent slow frames: p95 stays at 16.7
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: ok.stats(), baseline: null }), 'glass');
  const bad = new FrameWindow();
  for (let i = 0; i < 100; i++) bad.push(16.7);
  for (let i = 0; i < 20; i++) bad.push(60); // 17 percent slow frames
  assert.equal(decideGlass({ mode: 'auto', current: 'glass', glass: bad.stats(), baseline: null }), 'solid');
});

test('parseGlassMode', () => {
  assert.equal(parseGlassMode('ON'), 'on');
  assert.equal(parseGlassMode(' off '), 'off');
  assert.equal(parseGlassMode('auto'), 'auto');
  assert.equal(parseGlassMode('maybe'), 'auto');
  assert.equal(parseGlassMode(null), 'auto');
  assert.equal(parseGlassMode(undefined), 'auto');
});
