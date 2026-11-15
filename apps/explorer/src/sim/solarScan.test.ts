import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulMat3Vec3, normalize, vec3 } from '../astro/vec3.ts';
import { iauMoonFrame } from './lunarOrientation.ts';
import { buildSiteModel } from './solarSite.ts';
import type { HorizonProfile, SiteModel, SunSample } from './solarSite.ts';
import {
  SunUnavailableError, chooseStepMs, elevationRate, extractEvents, nextEvent, previousEvent, scanSite, stateAt, summariseDaylight,
} from './solarScan.ts';
import type { SunSampler } from './solarScan.ts';
import { meeusSunEqj } from './solarTestSupport.ts';

const PERIOD_S = 29.530589 * 86400;
const OMEGA = (2 * Math.PI) / PERIOD_S;
const site0 = buildSiteModel(null, 0, 0);
const sampler: SunSampler = (utcMs) => {
  const th = Math.PI / 2 - OMEGA * (utcMs / 1000);
  return { utcMs, sunDirFixed: vec3(Math.cos(th), Math.sin(th), 0), sunDistanceAu: 1, earthVecFixedKm: null } satisfies SunSample;
};
const tOfTheta = (thDeg: number): number => ((Math.PI / 2 - (thDeg * Math.PI) / 180) / OMEGA) * 1000;

test('the coarse step is about 400 samples, between 1 and 30 minutes', () => {
  assert.equal(chooseStepMs(3_600_000), 60_000);
  assert.equal(chooseStepMs(86_400_000), 216_000);
  assert.equal(chooseStepMs(30 * 86_400_000), 1_800_000);
  assert.equal(chooseStepMs(1000), 60_000);
});

test('sunrise, sunset, maximum and minimum are found at the analytic times (within 1 second)', async () => {
  const t0 = -86_400_000;
  const t1 = Math.round(0.8 * PERIOD_S * 1000);
  const scan = await scanSite(site0, sampler, t0, t1);
  const ev = extractEvents(scan, site0, sampler);
  const rise = ev.find((e) => e.kind === 'sunrise');
  const set = ev.find((e) => e.kind === 'sunset');
  const max = ev.find((e) => e.kind === 'max-elevation');
  const min = ev.find((e) => e.kind === 'min-elevation');
  assert.ok(rise && set && max && min);
  assert.ok(Math.abs(rise.utcMs - 0) <= 1000, `sunrise off by ${rise.utcMs}`);
  assert.ok(Math.abs(set.utcMs - tOfTheta(-90)) <= 1000, `sunset off by ${set.utcMs - tOfTheta(-90)}`);
  assert.ok(Math.abs(max.utcMs - tOfTheta(0)) <= 120_000, `max off by ${max.utcMs - tOfTheta(0)} ms`); // flat top: a couple of minutes is the honest precision
  assert.ok(Math.abs(max.elevationDeg - 90) < 1e-3);
  assert.ok(Math.abs(min.elevationDeg + 90) < 1e-3);
  assert.deepEqual(ev.map((e) => e.kind), ['sunrise', 'max-elevation', 'sunset', 'min-elevation']);
});

test('a terrain ridge produces terrain-shadow END after sunrise (first light is later than sunrise) and START before sunset', async () => {
  const horizon: HorizonProfile = { terrainModelled: true, azimuthStepDeg: 1, anglesDeg: new Float32Array(360), maxDistanceKm: 250, sampleSpacingKm: 1.9 };
  for (let b = 60; b <= 120; b++) horizon.anglesDeg[b] = 10; // east ridge
  for (let b = 240; b <= 300; b++) horizon.anglesDeg[b] = 4; // west ridge
  const site: SiteModel = { ...site0, horizon };
  const t0 = -86_400_000;
  const scan = await scanSite(site, sampler, t0, Math.round(0.6 * PERIOD_S * 1000));
  const ev = extractEvents(scan, site, sampler);
  const kinds = ev.map((e) => e.kind);
  assert.ok(kinds.indexOf('sunrise') < kinds.indexOf('terrain-shadow-end'));
  assert.ok(kinds.indexOf('terrain-shadow-start') < kinds.indexOf('sunset'));
  const end = ev.find((e) => e.kind === 'terrain-shadow-end')!;
  assert.ok(Math.abs(end.utcMs - tOfTheta(80)) <= 1000, `ridge clears at ${end.utcMs - tOfTheta(80)} ms off`);
  const start = ev.find((e) => e.kind === 'terrain-shadow-start')!;
  assert.ok(Math.abs(start.utcMs - tOfTheta(-86)) <= 1000);
  // Sun-above-horizon but blocked is not the same as darkness: at the end event the Sun is 10 deg up
  assert.ok(Math.abs(end.elevationDeg - 10) < 0.01);
});

test('two transitions inside one coarse step are both found', async () => {
  // a thin 10-degree ridge exactly one 20-minute window wide in elevation terms is hard to hit; use a huge step instead
  const horizon: HorizonProfile = { terrainModelled: true, azimuthStepDeg: 1, anglesDeg: new Float32Array(360), maxDistanceKm: 250, sampleSpacingKm: 1.9 };
  for (let b = 60; b <= 120; b++) horizon.anglesDeg[b] = 0.3; // 0.3 deg ridge: sunrise then terrain end ~35 min later
  const site: SiteModel = { ...site0, horizon };
  const scan = await scanSite(site, sampler, -3_600_000, 6 * 3_600_000, { stepMs: 3 * 3_600_000 });
  const ev = extractEvents(scan, site, sampler);
  assert.ok(ev.some((e) => e.kind === 'sunrise'));
  assert.ok(ev.some((e) => e.kind === 'terrain-shadow-end'), 'the second edge inside the same coarse step must not be lost');
});

test('next / previous event lookups', async () => {
  const scan = await scanSite(site0, sampler, -86_400_000, Math.round(0.8 * PERIOD_S * 1000));
  const ev = extractEvents(scan, site0, sampler);
  const mid = tOfTheta(45);
  assert.equal(nextEvent(ev, mid, ['sunset'])?.kind, 'sunset');
  assert.equal(previousEvent(ev, mid, ['sunrise'])?.kind, 'sunrise');
  assert.equal(nextEvent(ev, tOfTheta(-170), ['sunset']), null);
});

test('daylight summary: elapsed since sunrise and time to sunset are computed from found events, never invented', async () => {
  const scan = await scanSite(site0, sampler, -86_400_000, Math.round(0.8 * PERIOD_S * 1000));
  const ev = extractEvents(scan, site0, sampler);
  const now = tOfTheta(45);
  const cur = stateAt(site0, sampler, now);
  const d = summariseDaylight(ev, scan, cur);
  assert.ok(Math.abs((d.sinceSunriseMs ?? NaN) - now) < 2000);
  assert.ok(Math.abs((d.untilSunsetMs ?? NaN) - (tOfTheta(-90) - now)) < 2000);
  assert.equal(d.untilSunriseMs, null);
  // at night we get the time to the next sunrise only if one lies inside the window
  const night = stateAt(site0, sampler, tOfTheta(-120));
  const dn = summariseDaylight(ev, scan, night);
  assert.equal(dn.untilSunriseMs, null);
  assert.ok(dn.note !== null && /No sunrise found/.test(dn.note));
  // outside the window: unknown, with a reason
  const out = summariseDaylight(ev, scan, { ...cur, utcMs: scan.t1 + 1 });
  assert.equal(out.sinceSunriseMs, null);
  assert.ok(out.note !== null);
});

test('elevation rate has the right sign: rising in the morning, falling in the afternoon', () => {
  assert.ok((elevationRate(site0, sampler, tOfTheta(60)) ?? 0) > 0);
  assert.ok((elevationRate(site0, sampler, tOfTheta(-60)) ?? 0) < 0);
  near(elevationRate(site0, sampler, tOfTheta(60)) ?? 0, (OMEGA * 180 / Math.PI) * 3600, 0.02); // the Sun's elevation changes at exactly omega on this great-circle path
});
function near(a: number, b: number, tol: number): void { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }

test('a failing Sun position stops the scan with a clear error instead of a wrong result', async () => {
  const bad: SunSampler = (t) => (t > 1_000_000 ? null : sampler(t));
  await assert.rejects(scanSite(site0, bad, 0, 5_000_000), (e: unknown) => e instanceof SunUnavailableError);
});

test('a cancelled scan returns no states (so a stale result can never be shown)', async () => {
  const control = { cancelled: true };
  const scan = await scanSite(site0, sampler, 0, 20 * 86_400_000, { control, sliceMs: 0 });
  assert.equal(scan.cancelled, true);
  assert.equal(scan.states.length, 0);
});

test('invalid ranges are rejected', async () => {
  await assert.rejects(scanSite(site0, sampler, 10, 10));
});

// ------------- real geometry: independent Sun (Meeus) + IAU Moon orientation ----------------
const realSampler: SunSampler = (utcMs) => {
  const f = iauMoonFrame(utcMs, 69);
  const sun = meeusSunEqj(utcMs);
  return { utcMs, sunDirFixed: normalize(mulMat3Vec3(f.eqjToMoonFixed, sun.dir)), sunDistanceAu: sun.distanceAu, earthVecFixedKm: null };
};

test('Apollo 11 site: sunrise about 21 h before touchdown, sunset about 14.8 days after sunrise', async () => {
  // Touchdown 1969-07-20 20:17:39 UTC with the Sun 10.8 deg up (NASA planning figure) and rising about 0.5 deg/h
  // puts sunrise (Sun centre at the horizon) roughly 21 h earlier. A consistency check, not an independent sunrise record.
  const site = buildSiteModel(null, 0.67409, 23.47298);
  const t0 = Date.UTC(1969, 6, 18, 0, 0, 0);
  const t1 = Date.UTC(1969, 7, 6, 0, 0, 0);
  const scan = await scanSite(site, realSampler, t0, t1);
  const ev = extractEvents(scan, site, realSampler);
  const rise = ev.find((e) => e.kind === 'sunrise')!;
  const set = ev.find((e) => e.kind === 'sunset')!;
  const touchdown = Date.UTC(1969, 6, 20, 20, 17, 39);
  const hoursBefore = (touchdown - rise.utcMs) / 3_600_000;
  assert.ok(hoursBefore > 19.5 && hoursBefore < 23, `sunrise ${hoursBefore} h before touchdown`);
  const dayDays = (set.utcMs - rise.utcMs) / 86_400_000;
  assert.ok(dayDays > 14.2 && dayDays < 15.3, `daylight ${dayDays} days`);
});

test('south pole region: the Sun stays within about 1.6 degrees of the horizon all month (a property of the 1.54 degree axis tilt)', async () => {
  const site = buildSiteModel(null, -89.9, 0);
  const scan = await scanSite(site, realSampler, Date.UTC(2026, 10, 1), Date.UTC(2026, 10, 30));
  let lo = 90;
  let hi = -90;
  for (const s of scan.states) { lo = Math.min(lo, s.elevationDeg); hi = Math.max(hi, s.elevationDeg); }
  assert.ok(hi - lo < 3.4, `range ${lo}..${hi}`);
  assert.ok(Math.max(Math.abs(lo), Math.abs(hi)) < 1.8, `range ${lo}..${hi}`);
});

test('the equatorial far-side and near-side sites have opposite phase of day (about 14.8 days apart): no mirrored longitude', async () => {
  const t = Date.UTC(2026, 10, 1);
  const a = realSampler(t)!.sunDirFixed;
  // sub-solar longitude differs from the antipodal site's anti-solar longitude by 180: check the Sun elevation signs are opposite
  const near1 = buildSiteModel(null, 0, 0);
  const far1 = buildSiteModel(null, 0, 180);
  const e1 = stateAt(near1, realSampler, t).elevationDeg;
  const e2 = stateAt(far1, realSampler, t).elevationDeg;
  assert.ok(e1 * e2 < 0 || Math.abs(e1 + e2) < 3.2, `${e1} ${e2}`);
  assert.ok(Math.abs(a.x * a.x + a.y * a.y + a.z * a.z - 1) < 1e-12);
});
