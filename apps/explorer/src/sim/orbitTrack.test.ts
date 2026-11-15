import test from 'node:test';
import assert from 'node:assert/strict';
import { vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { KM_PER_SCENE_UNIT, MoonTrackCache, kmToSceneUnits, sampleMoonTrack } from './orbitTrack.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 19);

/** A fake Moon on a circle of radius 384400 km, one turn per 27.32 days, in the EQJ x-y plane. */
function circle(ms: number): Vec3 {
  const a = ((ms - T0) / DAY / 27.32) * 2 * Math.PI;
  return vec3(384400 * Math.cos(a), 384400 * Math.sin(a), 0);
}

test('track: samples are evenly spaced, ordered, centred on the requested time, and come from the position function', () => {
  const t = sampleMoonTrack(T0, 13.5, 0.5, circle);
  assert.equal(t.samples.length, 55);
  assert.equal(t.samples[0]!.utcMs, T0 - 13.5 * DAY);
  assert.equal(t.samples[54]!.utcMs, T0 + 13.5 * DAY);
  assert.equal(t.samples[27]!.utcMs, T0);
  for (let i = 1; i < t.samples.length; i++) assert.equal(t.samples[i]!.utcMs - t.samples[i - 1]!.utcMs, 0.5 * DAY);
  const mid = t.samples[27]!.posKm;
  assert.ok(Math.abs(mid.x - 384400) < 1e-6 && Math.abs(mid.y) < 1e-6);
});

test('track: instants the ephemeris cannot compute are skipped, not invented', () => {
  const t = sampleMoonTrack(T0, 2, 1, (ms) => (ms < T0 ? null : circle(ms)));
  assert.equal(t.samples.length, 3);
  assert.ok(t.samples.every((s) => s.utcMs >= T0));
  assert.throws(() => sampleMoonTrack(T0, 0, 1, circle), RangeError);
  assert.throws(() => sampleMoonTrack(T0, 1, 0, circle), RangeError);
});

test('track scale: 100,000 km is one scene unit and the axes use the shared mapping (north up)', () => {
  assert.equal(KM_PER_SCENE_UNIT, 100000);
  const p = kmToSceneUnits(vec3(384400, 0, 0));
  assert.ok(Math.abs(p.x - 3.844) < 1e-12 && p.y === 0 && Math.abs(p.z) < 1e-12);
  const north = kmToSceneUnits(vec3(0, 0, 200000));
  assert.ok(Math.abs(north.y - 2) < 1e-12);
  const east = kmToSceneUnits(vec3(0, 100000, 0)); // EQJ +y becomes scene -z
  assert.ok(Math.abs(east.z - -1) < 1e-12);
});

test('track cache: reuses the track until the time moves beyond the recentre distance, honouring the interval', () => {
  let calls = 0;
  const cache = new MoonTrackCache((ms) => {
    calls++;
    return circle(ms);
  });
  const first = cache.get(T0, 0);
  assert.equal(cache.recomputeCount, 1);
  const samplesPerTrack = calls;
  // Small moves reuse the same object.
  assert.equal(cache.get(T0 + 1 * DAY, 10), first);
  assert.equal(cache.get(T0 + 2.9 * DAY, 20), first);
  assert.equal(cache.recomputeCount, 1);
  // Beyond 3 days but too soon after the last computation (400 ms): still reused.
  assert.equal(cache.get(T0 + 4 * DAY, 100), first);
  assert.equal(cache.recomputeCount, 1);
  // Beyond 3 days and enough real time has passed: recomputed around the new centre.
  const second = cache.get(T0 + 4 * DAY, 500);
  assert.notEqual(second, first);
  assert.equal(second.centerMs, T0 + 4 * DAY);
  assert.equal(cache.recomputeCount, 2);
  assert.equal(calls, 2 * samplesPerTrack);
  // Moving backwards also triggers a recompute.
  const third = cache.get(T0 - 5 * DAY, 2000);
  assert.equal(third.centerMs, T0 - 5 * DAY);
  cache.invalidate();
  assert.equal(cache.get(T0, 2001).centerMs, T0, 'invalidate forces an immediate recompute');
});
