import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dot, normalize, vec3 } from '../astro/vec3.ts';
import {
  DEFAULT_PANEL, SOLAR_IRRADIANCE_1AU_WM2, formatDuration, formatEnergy, integratePower, panelNormal, panelPower,
  performanceFactor, solarIrradianceAtDistance, validatePanel,
} from './solarPower.ts';
import type { PanelConfig } from './solarPower.ts';
import { buildSiteModel, directionFromAltAz, evaluateSite } from './solarSite.ts';
import type { HorizonProfile, SiteModel, SunSample } from './solarSite.ts';
import { scanSite } from './solarScan.ts';
import type { SunSampler } from './solarScan.ts';

const near = (a: number, b: number, tol: number, msg = ''): void => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (tol ${tol})`);
const rel = (a: number, b: number, tol: number, msg = ''): void => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} ${a} vs ${b} (rel tol ${tol})`);

const site0 = buildSiteModel(null, 0, 0); // up +X, east +Y, north +Z
const stateFor = (site: SiteModel, el: number, az: number, au = 1) =>
  evaluateSite(site, { utcMs: 0, sunDirFixed: directionFromAltAz(site.frame, el, az), sunDistanceAu: au, earthVecFixedKm: null });
const panel = (over: Partial<PanelConfig> = {}): PanelConfig => ({ ...DEFAULT_PANEL, ...over });

test('irradiance follows the inverse-square law with the REAL distance', () => {
  assert.equal(SOLAR_IRRADIANCE_1AU_WM2, 1361);
  near(solarIrradianceAtDistance(1), 1361, 1e-9);
  near(solarIrradianceAtDistance(0.98329), 1361 / (0.98329 ** 2), 1e-9); // perihelion: about 1407.6
  near(solarIrradianceAtDistance(1.01671), 1361 / (1.01671 ** 2), 1e-9); // aphelion: about 1316.6
  assert.ok(solarIrradianceAtDistance(0.98329) > 1400 && solarIrradianceAtDistance(1.01671) < 1320);
  assert.throws(() => solarIrradianceAtDistance(0));
});

test('five stages with independent hand arithmetic: Sun overhead, 10 m2, 25 %, 15 % losses', () => {
  const st = stateFor(site0, 90, 0);
  const p = panelPower(st, site0.frame, panel());
  near(p.solarIrradianceWm2, 1361, 1e-9);
  near(p.directNormalWm2, 1361, 1e-9);
  near(p.incidentWm2, 1361, 1e-9);
  near(p.incidentW, 13610, 1e-6);
  near(p.electricalW, 13610 * 0.25 * 0.85, 1e-6); // = 2892.125 W
  assert.equal(p.zeroReason, null);
});

test('power scales linearly with area and efficiency, and with (1 - losses)', () => {
  const st = stateFor(site0, 50, 123);
  const base = panelPower(st, site0.frame, panel()).electricalW;
  rel(panelPower(st, site0.frame, panel({ areaM2: 25 })).electricalW, base * 2.5, 1e-12);
  rel(panelPower(st, site0.frame, panel({ efficiencyPct: 10 })).electricalW, base * (10 / 25), 1e-12);
  rel(panelPower(st, site0.frame, panel({ lossesPct: 0 })).electricalW, base / 0.85, 1e-12);
  rel(panelPower(st, site0.frame, panel({ lossesPct: 50 })).electricalW, base * (0.5 / 0.85), 1e-12);
  near(performanceFactor(panel({ lossesPct: 15 })), 0.85, 1e-12);
});

test('the incidence angle uses the PANEL normal, not the ground normal', () => {
  // Sun 30 degrees above the east horizon. A horizontal panel gets sin(30); a panel tilted 60 degrees toward east (normal 30 degrees above east) gets cos 0.
  const st = stateFor(site0, 30, 90);
  const hor = panelPower(st, site0.frame, panel({ mode: 'horizontal' }));
  near(hor.incidentWm2, 1361 * Math.sin(30 * Math.PI / 180), 1e-9);
  const tilted = panelPower(st, site0.frame, panel({ mode: 'tilted', tiltDeg: 60, azimuthDeg: 90 }));
  near(tilted.incidentWm2, 1361, 1e-9); // normal points straight at the Sun
  near(tilted.cosIncidenceSigned, 1, 1e-12);
  assert.ok(tilted.electricalW > hor.electricalW);
});

test('panel normals: horizontal = up; tilt 90 facing east = east; tilt angle from up is the tilt; tracking = Sun', () => {
  const f = site0.frame;
  const sun = normalize(vec3(1, 1, 0.2));
  assert.deepEqual(panelNormal(panel({ mode: 'horizontal' }), f, sun), f.up);
  const east = panelNormal(panel({ mode: 'tilted', tiltDeg: 90, azimuthDeg: 90 }), f, sun);
  near(dot(east, f.east), 1, 1e-12);
  const t30 = panelNormal(panel({ mode: 'tilted', tiltDeg: 30, azimuthDeg: 0 }), f, sun);
  near(Math.acos(dot(t30, f.up)) * 180 / Math.PI, 30, 1e-9);
  assert.ok(dot(t30, f.north) > 0.49 && dot(t30, f.north) < 0.51); // facing north
  near(dot(panelNormal(panel({ mode: 'tracking' }), f, sun), sun), 1, 1e-12);
});

test('zero direct power when the panel faces away from the Sun', () => {
  const st = stateFor(site0, 45, 90); // morning Sun in the east
  const p = panelPower(st, site0.frame, panel({ mode: 'tilted', tiltDeg: 90, azimuthDeg: 270 })); // vertical panel facing west
  assert.equal(p.electricalW, 0);
  assert.ok(p.cosIncidenceSigned < 0);
  assert.equal(p.zeroReason, 'panel-faces-away');
});

test('zero power in darkness, in terrain shadow and during a total eclipse, each with its own reason', () => {
  const night = panelPower(stateFor(site0, -5, 90), site0.frame, panel());
  assert.equal(night.electricalW, 0); assert.equal(night.zeroReason, 'darkness'); assert.equal(night.directNormalWm2, 0);
  const wall: HorizonProfile = { terrainModelled: true, azimuthStepDeg: 1, anglesDeg: new Float32Array(360).fill(12), maxDistanceKm: 250, sampleSpacingKm: 1.9 };
  const walled: SiteModel = { ...site0, horizon: wall };
  const shadow = panelPower(stateFor(walled, 6, 100), walled.frame, panel({ mode: 'tracking' }));
  assert.equal(shadow.electricalW, 0); assert.equal(shadow.zeroReason, 'terrain-shadow');
  const eclipsed = evaluateSite(site0, { utcMs: 0, sunDirFixed: vec3(1, 0, 0), sunDistanceAu: 1, earthVecFixedKm: vec3(384400, 0, 0) });
  const ecl = panelPower(eclipsed, site0.frame, panel({ mode: 'tracking' }));
  assert.equal(ecl.electricalW, 0); assert.equal(ecl.zeroReason, 'eclipse');
  // the irradiance at the Moon is still reported separately from what reaches the site
  near(ecl.solarIrradianceWm2, 1361, 1e-9);
});

test('a hidden Sun never produces reflected or invented power (exactly 0 W for any panel)', () => {
  for (const mode of ['horizontal', 'tilted', 'tracking'] as const) {
    assert.equal(panelPower(stateFor(site0, -30, 10), site0.frame, panel({ mode })).electricalW, 0);
  }
});

test('panel validation rejects impossible values', () => {
  assert.deepEqual(validatePanel(DEFAULT_PANEL), []);
  assert.ok(validatePanel(panel({ areaM2: 0 })).length > 0);
  assert.ok(validatePanel(panel({ efficiencyPct: 120 })).length > 0);
  assert.ok(validatePanel(panel({ lossesPct: 100 })).length > 0);
  assert.ok(validatePanel(panel({ tiltDeg: 91 })).length > 0);
  assert.ok(validatePanel(panel({ areaM2: Number.NaN })).length > 0);
});

// ---------- energy: analytic references -----------------------------------------------
// A site on the equator at longitude 0 with a Sun that turns uniformly through the sky:
// sun = (cos th, sin th, 0), th = 90 deg - w t. Elevation = 90 - th for th in (0, 90) east side...
const PERIOD_S = 29.530589 * 86400;
const OMEGA = (2 * Math.PI) / PERIOD_S; // rad/s
const T0 = 0;
const sunAt = (utcMs: number): SunSample => {
  const th = Math.PI / 2 - OMEGA * ((utcMs - T0) / 1000);
  return { utcMs, sunDirFixed: vec3(Math.cos(th), Math.sin(th), 0), sunDistanceAu: 1, earthVecFixedKm: null };
};
const sampler: SunSampler = sunAt;
const P0 = 1361 * 10 * 0.25 * 0.85;
const windowEnd = Math.round(0.8 * PERIOD_S * 1000); // sunrise at 0 (th = 90), sunset at T/2 (th = -90)
const T_START = -86_400_000;

test('energy of a horizontal panel over one full lunar day = P0 * 2 / omega (analytic)', async () => {
  const scan = await scanSite(site0, sampler, T_START, windowEnd);
  const e = integratePower(scan.states, site0.frame, panel());
  rel(e.energyWh * 3600, P0 * 2 / OMEGA, 2e-4);
  near(e.peakW, P0, P0 * 1e-4);
  assert.equal(e.minW, 0);
  // generating time = the daylight duration T/2 (to within the 1 s refinement)
  near(e.generatingS, PERIOD_S / 2, 3);
  near(e.generatingS + e.zeroS, e.durationS, 1e-6);
  near(e.averageW, (e.energyWh * 3600) / e.durationS, 1e-6);
});

test('an idealised tracker gives constant power for exactly the daylight duration', async () => {
  const scan = await scanSite(site0, sampler, T_START, windowEnd);
  const e = integratePower(scan.states, site0.frame, panel({ mode: 'tracking' }));
  rel(e.energyWh * 3600, P0 * (PERIOD_S / 2), 2e-5);
  near(e.peakW, P0, 1e-6);
});

test('a vertical east-facing panel collects only the morning: E = P0 / omega, with the facing-away crossing handled', async () => {
  const scan = await scanSite(site0, sampler, T_START, windowEnd);
  const e = integratePower(scan.states, site0.frame, panel({ mode: 'tilted', tiltDeg: 90, azimuthDeg: 90 }));
  rel(e.energyWh * 3600, P0 / OMEGA, 3e-4);
  near(e.generatingS, PERIOD_S / 4, 60); // sunrise to the Sun passing overhead
});

test('terrain shadow transitions: a 10 degree eastern ridge removes exactly the first 10 degrees of the morning', async () => {
  const horizon: HorizonProfile = { terrainModelled: true, azimuthStepDeg: 1, anglesDeg: new Float32Array(360), maxDistanceKm: 250, sampleSpacingKm: 1.9 };
  for (let b = 60; b <= 120; b++) horizon.anglesDeg[b] = 10;
  const walled: SiteModel = { ...site0, horizon };
  const scan = await scanSite(walled, sampler, T_START, windowEnd);
  const e = integratePower(scan.states, walled.frame, panel());
  const expected = (P0 * (Math.sin(80 * Math.PI / 180) + 1)) / OMEGA; // integral of cos(th) from th = -90 to 80 deg
  rel(e.energyWh * 3600, expected, 3e-4);
  // the shadow lasts 10 degrees of elevation = 10 deg / omega
  const lost = PERIOD_S / 2 - e.generatingS;
  near(lost, (10 * Math.PI / 180) / OMEGA, 5);
});

test('same location, same period, different panels: results come from the SAME samples and compare consistently', async () => {
  const scan = await scanSite(site0, sampler, T_START, windowEnd);
  const flat = integratePower(scan.states, site0.frame, panel());
  const double = integratePower(scan.states, site0.frame, panel({ areaM2: 20 }));
  const track = integratePower(scan.states, site0.frame, panel({ mode: 'tracking' }));
  rel(double.energyWh, flat.energyWh * 2, 1e-12);
  assert.ok(track.energyWh > flat.energyWh);
  rel(track.energyWh / flat.energyWh, (Math.PI / 2) / 1, 5e-4); // (T/2) / (2/omega) = pi/2
  assert.equal(track.sampleCount, flat.sampleCount);
});

test('power-to-energy units: 1 hour of constant 1000 W = 1000 Wh = 1 kWh', () => {
  const mk = () => stateFor(site0, 90, 0);
  const states = [0, 1_800_000, 3_600_000].map((t) => ({ ...mk(), utcMs: t }));
  const cfg = panel({ areaM2: 1, efficiencyPct: 100, lossesPct: 0, mode: 'tracking' });
  const p = panelPower(states[0]!, site0.frame, cfg).electricalW; // 1361 W
  const e = integratePower(states, site0.frame, cfg);
  near(e.energyWh, p, 1e-9);
  assert.equal(formatEnergy(1000), '1.00 kWh');
  assert.equal(formatEnergy(12.345), '12.3 Wh');
  assert.equal(formatDuration(3 * 86400 + 2 * 3600), '3 d 2 h');
});

test('integration needs at least two samples', () => {
  assert.throws(() => integratePower([stateFor(site0, 10, 90)], site0.frame, panel()));
});

test('refinement at shadow edges matters for short windows (coarse 30 min step across a 4 hour window)', async () => {
  const horizon: HorizonProfile = { terrainModelled: true, azimuthStepDeg: 1, anglesDeg: new Float32Array(360), maxDistanceKm: 250, sampleSpacingKm: 1.9 };
  for (let b = 60; b <= 120; b++) horizon.anglesDeg[b] = 10;
  const walled: SiteModel = { ...site0, horizon };
  // window from Sun elevation 7 deg (th = 83) to elevation 16 deg (th = 74); the ridge (10 deg) is crossed inside it
  const tAt = (thDeg: number): number => Math.round(((Math.PI / 2 - (thDeg * Math.PI) / 180) / OMEGA) * 1000);
  const a = tAt(83);
  const b = tAt(74);
  const expected = (P0 * (Math.sin(80 * Math.PI / 180) - Math.sin(74 * Math.PI / 180))) / OMEGA; // only th from 80 down to 74 is lit
  const refined = await scanSite(walled, sampler, a, b, { stepMs: 1_800_000, refineMs: 1000 });
  const unrefined = await scanSite(walled, sampler, a, b, { stepMs: 1_800_000, refineMs: 1_800_000 });
  const eR = integratePower(refined.states, walled.frame, panel()).energyWh * 3600;
  const eU = integratePower(unrefined.states, walled.frame, panel()).energyWh * 3600;
  const errR = Math.abs(eR - expected) / expected;
  const errU = Math.abs(eU - expected) / expected;
  assert.ok(errR < 2e-3, `refined error ${errR}`);
  assert.ok(errU > 10 * errR, `unrefined ${errU} should be much worse than refined ${errR}`);
});
