import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODE,
  MODES,
  MODE_ORDER,
  MODE_STATUS_LABEL,
  isModeAvailable,
  isModeId,
  modeDescriptor,
  modeView,
} from '../modes/visualisationModes.ts';
import { INITIAL_MODE_STATE, createModeStore, reduceMode } from '../modes/modeStore.ts';
import {
  DATUM_STATEMENT,
  DEM_PRODUCTS,
  REFERENCE_SPHERE_RADIUS_M,
  SOURCES,
  demProduct,
  globalRasterSize,
  globalRawBytes,
  pixelSizeMetres,
} from '../modes/demSources.ts';
import { decodeHeightMetres, heightToSceneRadius } from './lunarElevation.ts';

// ---- the registry is honest ------------------------------------------------------------------

test('there are exactly six modes, in the documented order, and Normal is the default', () => {
  assert.deepEqual([...MODE_ORDER], ['normal', 'elevation', 'slope', 'relief', 'illumination', 'safety']);
  assert.equal(DEFAULT_MODE, 'normal');
  assert.equal(INITIAL_MODE_STATE.active, 'normal');
  for (const id of MODE_ORDER) assert.equal(modeDescriptor(id).id, id);
});

test('only Normal, Elevation and Illumination (single-site analysis) claim to be available; every other mode says it is not implemented and shows no values', () => {
  assert.equal(isModeAvailable('normal'), true);
  assert.equal(isModeAvailable('elevation'), true);
  assert.equal(isModeAvailable('illumination'), true);
  assert.deepEqual(MODE_ORDER.filter((m) => isModeAvailable(m)), ['normal', 'elevation', 'illumination']);
  assert.equal(modeView('illumination').notice, '');
  assert.equal(modeView('elevation').chip, undefined);
  assert.equal(modeView('elevation').notice, '');
  for (const id of MODE_ORDER.filter((m) => m !== 'normal' && m !== 'elevation' && m !== 'illumination')) {
    const d = MODES[id];
    assert.notEqual(d.status, 'available', `${id} must not claim to work yet`);
    assert.ok(d.notice.length > 0, `${id} needs an on-screen notice`);
    assert.match(d.notice, /Normal appearance/);
    assert.match(d.notice, /No values .* calculated or shown/);
    assert.ok(d.needs.length > 0 && d.plannedContent.length > 0, `${id} lists what it still needs`);
    const v = modeView(id);
    assert.equal(v.available, false);
    assert.match(v.chip ?? '', /not implemented: showing Normal view/);
  }
  assert.equal(modeView('normal').chip, undefined);
  assert.equal(modeView('normal').notice, '');
});

test('status wording is distinct per status, and Landing safety stays "awaiting data"', () => {
  assert.equal(new Set(Object.values(MODE_STATUS_LABEL)).size, 3);
  assert.equal(MODES.illumination.status, 'available');
  assert.equal(MODES.safety.status, 'awaiting-data');
  assert.equal(MODES.elevation.status, 'available');
  assert.equal(MODES.slope.status, 'awaiting-implementation');
  assert.equal(modeView('safety').statusLabel, 'Awaiting data');
});

test('safety and illumination state the honesty limits (illumination: no whole-Moon shadow map, no permanently-shadowed claim)', () => {
  assert.ok(MODES.safety.needs.some((n) => /Verified lander requirements/.test(n)));
  assert.ok(MODES.safety.plannedContent.some((n) => /No single score/.test(n)));
  assert.ok(MODES.illumination.needs.some((n) => /never label a region permanently shadowed/.test(n)));
  assert.ok(MODES.illumination.needs.some((n) => /whole-Moon terrain-shadow map/.test(n)));
  assert.match(MODES.illumination.purpose, /that exact site/);
  assert.ok(MODES.relief.plannedContent.some((n) => /NOT real sunlight/.test(n)));
});

test('isModeId accepts only the six ids', () => {
  for (const id of MODE_ORDER) assert.equal(isModeId(id), true);
  for (const bad of ['', 'Normal', 'terrain', 'constructor', undefined, null, 3, {}]) assert.equal(isModeId(bad), false);
});

// ---- mode switching ------------------------------------------------------------------------------

test('reducer: valid selection changes the mode; unknown ids and re-selection change nothing (same object)', () => {
  const s0 = INITIAL_MODE_STATE;
  const s1 = reduceMode(s0, { type: 'select', mode: 'elevation' });
  assert.equal(s1.active, 'elevation');
  assert.notEqual(s1, s0);
  assert.equal(reduceMode(s1, { type: 'select', mode: 'elevation' }), s1);
  assert.equal(reduceMode(s1, { type: 'select', mode: 'bogus' }), s1);
  assert.equal(reduceMode(s1, { type: 'select', mode: undefined }), s1);
  assert.equal(reduceMode(s1, { type: 'reset' }).active, 'normal');
  assert.equal(reduceMode(s0, { type: 'reset' }), s0);
});

test('store: starts in Normal, notifies once per real change, ignores no-ops and bad ids, and unsubscribes', () => {
  const store = createModeStore();
  assert.equal(store.getState().active, 'normal');
  const seen: string[] = [];
  const off = store.subscribe((s) => seen.push(s.active));
  store.select('slope');
  store.select('slope');
  store.select('nonsense');
  store.select('safety');
  store.select('normal');
  assert.deepEqual(seen, ['slope', 'safety', 'normal']);
  off();
  store.select('relief');
  assert.deepEqual(seen, ['slope', 'safety', 'normal'], 'no notification after unsubscribe');
  store.reset();
  assert.equal(store.getState().active, 'normal');
});

test('mode state holds ONLY the active mode, so a switch cannot reset the camera, the clock or the selected mission', () => {
  const store = createModeStore();
  assert.deepEqual(Object.keys(store.getState()), ['active']);
  // Stand-ins for state that lives elsewhere in the app.
  const camera = { preset: 'southPole', zoom: 3.2 };
  const clock = { simTimeMs: 1_700_000_000_000, rate: 60 };
  const mission = { openMissionId: 'im-1' };
  const before = JSON.stringify({ camera, clock, mission });
  for (const id of [...MODE_ORDER, 'normal'] as const) {
    store.select(id);
    assert.deepEqual(Object.keys(store.getState()), ['active'], `after selecting ${id}`);
  }
  assert.equal(store.getState().active, 'normal');
  assert.equal(JSON.stringify({ camera, clock, mission }), before);
});

// ---- dataset records: documented numbers reproduce from first principles -------------------------

test('pixel sizes follow from pixels per degree on the 1737.4 km sphere and match the ODE table', () => {
  assert.equal(REFERENCE_SPHERE_RADIUS_M, 1_737_400);
  const documentedKm: Record<number, number> = { 4: 7.5808, 16: 1.895, 64: 0.4738, 128: 0.2369 };
  for (const [ppd, km] of Object.entries(documentedKm)) {
    const got = pixelSizeMetres(Number(ppd)) / 1000;
    assert.ok(Math.abs(got - km) / km < 0.001, `${ppd} ppd: ${got} km vs documented ${km} km`);
  }
  assert.ok(Math.abs(pixelSizeMetres(256) - 118.45) < 0.05);
  assert.ok(Math.abs(pixelSizeMetres(512) - 59.225) < 0.01);
  assert.ok(Math.abs(pixelSizeMetres(512) - 59.2252938) < 1e-4, 'matches the USGS geospatial field');
  assert.throws(() => pixelSizeMetres(0), RangeError);
});

test('raster sizes: LDEM_16 is 5760 x 2880 (what the app loads), and SLDEM2015 at 512 ppd is 184,320 columns over 360 degrees', () => {
  assert.deepEqual(globalRasterSize(16), { width: 5760, height: 2880 });
  assert.equal(globalRawBytes(16), 33_177_600);
  assert.deepEqual(globalRasterSize(64), { width: 23040, height: 11520 });
  assert.equal(globalRawBytes(64), 530_841_600);
  assert.equal(globalRasterSize(512).width, 184_320, 'USGS lists 184,320 columns');
  assert.equal(globalRasterSize(512).height * (120 / 180), 61_440, 'and 61,440 rows for the 120-degree band (-60 to 60)');
  assert.throws(() => globalRasterSize(1.5), RangeError);
});

test('the recommended global base is LDEM_16, and the browser-size consequences are written down', () => {
  const base = DEM_PRODUCTS.filter((p) => p.role === 'global-base');
  assert.equal(base.length, 1);
  assert.equal(base[0]?.id, 'lola-ldem-16');
  assert.match(base[0]?.recommendation ?? '', /RECOMMENDED/);
  assert.ok(globalRawBytes(64) > 100_000_000, 'LDEM_64 is too large to load raw');
  assert.match(demProduct('lola-ldem-64')?.recommendation ?? '', /too large/);
  assert.match(demProduct('sldem2015')?.recommendation ?? '', /22 GB/);
  assert.match(demProduct('lola-polar')?.recommendation ?? '', /poleward of 60/);
});

test('every dataset fact is labelled documented, derived or unknown, and every record cites sources that exist', () => {
  for (const p of DEM_PRODUCTS) {
    assert.ok(p.facts.length > 0);
    for (const f of p.facts) assert.ok(['documented', 'derived', 'unknown'].includes(f.status), `${p.id}: ${f.label}`);
    assert.ok(p.facts.some((f) => f.status === 'unknown'), `${p.id} must say what is not known`);
    assert.ok(p.sourceIds.length > 0);
    for (const sid of p.sourceIds) {
      const s = SOURCES[sid];
      assert.ok(s, `${p.id}: unknown source ${sid}`);
      assert.match(s.url, /^https:\/\//);
      assert.match(s.read, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  assert.equal(new Set(DEM_PRODUCTS.map((p) => p.id)).size, DEM_PRODUCTS.length);
});

test('the stated vertical datum matches the project decoder: 0 m is the unit sphere, heights are above the 1737.4 km sphere', () => {
  assert.match(DATUM_STATEMENT, /1737\.4 km/);
  assert.match(DATUM_STATEMENT, /not elevations above a geoid/);
  assert.equal(heightToSceneRadius(0), 1);
  assert.equal(decodeHeightMetres(20_000), 0, 'SVS count 20000 = 0 m');
  assert.equal(decodeHeightMetres(20_002), 1, 'DN step of 1 = 0.5 m');
});
