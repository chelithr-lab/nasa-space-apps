import test from 'node:test';
import assert from 'node:assert/strict';
import { daylightCycle, ringPoint, scaleLinear, skyPoint, timeAtX } from './solarView.ts';
import type { SolarEvent, SiteScan } from './solarScan.ts';

const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('sky plot: zenith is the centre, the horizon is the rim', () => {
  const z = skyPoint(90, 123, 100);
  near(z.x, 0);
  near(z.y, 0);
  near(Math.hypot(skyPoint(0, 217, 100).x, skyPoint(0, 217, 100).y), 100);
});

test('sky plot orientation (looking UP): north is up, east is on the LEFT, west on the right', () => {
  const n = skyPoint(0, 0, 100);
  near(n.x, 0);
  assert.ok(n.y < 0, 'north is toward the top of the screen');
  assert.ok(skyPoint(0, 90, 100).x < -99, 'east is on the left');
  assert.ok(skyPoint(0, 270, 100).x > 99, 'west is on the right');
  assert.ok(skyPoint(0, 180, 100).y > 99, 'south is toward the bottom');
});

test('sky plot: lower elevation is farther from the centre', () => {
  const r = (el: number): number => { const p = skyPoint(el, 40, 100); return Math.hypot(p.x, p.y); };
  assert.ok(r(60) < r(30) && r(30) < r(5));
  near(r(45), 50);
});

const ev = (kind: SolarEvent['kind'], utcMs: number): SolarEvent => ({ kind, utcMs, elevationDeg: 0 });
const scan = (t0: number, t1: number): SiteScan => ({ t0, t1, stepMs: 1, refineMs: 1, states: [], coarseStates: [], coarseSamples: 0, refinementSamples: 0, cancelled: false });

test('daylight cycle: sunrise to next sunrise from real events, with the right fractions', () => {
  const events = [ev('sunrise', 1000), ev('sunset', 1700), ev('sunrise', 2000)];
  const c = daylightCycle(events, scan(0, 3000), 1300);
  assert.ok(c !== null);
  near(c.nowFraction, 0.3);
  near(c.dayFraction, 0.7);
  assert.equal(c.startMs, 1000);
  assert.equal(c.endMs, 2000);
});

test('daylight cycle: never guessed when an event is missing or time is outside the window', () => {
  assert.equal(daylightCycle([ev('sunrise', 1000), ev('sunset', 1700)], scan(0, 3000), 1300), null);
  assert.equal(daylightCycle([ev('sunset', 1700), ev('sunrise', 2000)], scan(0, 3000), 1800), null);
  assert.equal(daylightCycle([ev('sunrise', 1000), ev('sunset', 1700), ev('sunrise', 2000)], scan(0, 3000), 5000), null);
});

test('ring and axis helpers', () => {
  near(ringPoint(0, 10).y, -10);
  near(ringPoint(0.25, 10).x, 10);
  near(ringPoint(0.5, 10).y, 10);
  assert.equal(scaleLinear(5, 0, 10, 0, 100), 50);
  assert.equal(scaleLinear(5, 5, 5, 0, 100), 50);
  assert.equal(timeAtX(50, 0, 100, 1000, 2000), 1500);
  assert.equal(timeAtX(-20, 0, 100, 1000, 2000), 1000);
  assert.equal(timeAtX(500, 0, 100, 1000, 2000), 2000);
});
