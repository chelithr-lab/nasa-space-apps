import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, OUTCOME_LABEL, findMission, markerSites, validateCatalogue } from './missionCatalogue.ts';
import type { FailedMission, LandedMission, Mission } from './missionCatalogue.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';

const landed = (id: string): LandedMission => {
  const m = findMission(id);
  assert.ok(m && (m.outcome === 'success' || m.outcome === 'partial'), `${id} should be a landed mission`);
  return m as LandedMission;
};
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const clone = (m: Mission): Mission => JSON.parse(JSON.stringify(m)) as Mission;

test('the real catalogue passes every validation rule', () => {
  assert.deepEqual(validateCatalogue(MISSIONS), []);
});

test('batch 1 contains exactly the missions researched, with unique stable ids', () => {
  const ids = MISSIONS.map((m) => m.id);
  assert.deepEqual(ids, ['apollo-11', 'apollo-12', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17', 'im-1', 'blue-ghost-1', 'im-2', 'peregrine-1']);
  assert.equal(new Set(ids).size, ids.length);
});

test('Apollo coordinates are the NSSDC printed values (spot checks, east-positive)', () => {
  const a11 = landed('apollo-11').location;
  assert.equal(a11.kind, 'surface-point');
  if (a11.kind === 'surface-point') {
    assert.equal(a11.coordinate.latDeg, 0.67416);
    assert.equal(a11.coordinate.lonDeg, 23.47314);
  }
  const a12 = landed('apollo-12').location;
  if (a12.kind === 'surface-point') {
    assert.equal(a12.coordinate.latDeg, -3.0128);
    assert.equal(a12.coordinate.lonDeg, -23.4219); // west of the prime meridian is NEGATIVE
  }
  const a17 = landed('apollo-17').location;
  if (a17.kind === 'surface-point') {
    assert.equal(a17.coordinate.latDeg, 20.1911);
    assert.equal(a17.coordinate.lonDeg, 30.7723);
  }
});

test('IM-1 uses the NASA printed coordinate, and its marker site is the same point', () => {
  const m = landed('im-1');
  assert.equal(m.location.kind, 'surface-point');
  if (m.location.kind === 'surface-point') {
    assert.equal(m.location.coordinate.latDeg, -80.13);
    assert.equal(m.location.coordinate.lonDeg, 1.44);
  }
  const site = markerSites().find((s) => s.id === 'im-1');
  assert.deepEqual([site?.latDeg, site?.lonDeg], [-80.13, 1.44]);
});

test('only landed missions with a PRINTED coordinate get a marker: Blue Ghost, IM-2 and Peregrine get none', () => {
  const ids = markerSites().map((s) => s.id);
  assert.deepEqual(ids, ['apollo-11', 'apollo-12', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17', 'im-1']);
  for (const id of ['blue-ghost-1', 'im-2', 'peregrine-1']) assert.ok(!ids.includes(id), `${id} must not have a marker`);
  assert.equal(landed('blue-ghost-1').location.kind, 'region-only');
  assert.equal(landed('im-2').location.kind, 'region-only');
});

test('the failed attempt never landed and cannot be mistaken for a landing', () => {
  const p = findMission('peregrine-1') as FailedMission;
  assert.equal(p.outcome, 'failed-no-landing');
  assert.equal(p.location.kind, 'none');
  assert.match(OUTCOME_LABEL[p.outcome], /did not land/i);
  assert.equal(p.payloads.length, 0);
});

test('statuses are labelled honestly: IM-1 and IM-2 are partial, Blue Ghost is a full success', () => {
  assert.equal(findMission('im-1')?.outcome, 'partial');
  assert.equal(findMission('im-2')?.outcome, 'partial');
  assert.equal(findMission('blue-ghost-1')?.outcome, 'success');
});

test('payload stages keep delivered, activated and operated apart', () => {
  const im2 = findMission('im-2');
  const stage = (id: string) => im2?.payloads.find((p) => p.id === id)?.stage;
  assert.equal(stage('im2-lra'), 'delivered');
  assert.equal(stage('im2-trident'), 'activated');
  assert.equal(stage('im2-msolo'), 'operated');
  const im1 = findMission('im-1');
  assert.equal(im1?.payloads.find((p) => p.id === 'im-1-lra')?.passive, true);
  assert.equal(findMission('blue-ghost-1')?.payloads.length, 10);
});

test('every record has https sources with verification dates, and optional fields may be empty without breaking anything', () => {
  for (const m of MISSIONS) {
    assert.ok(m.sources.length > 0);
    for (const s of m.sources) assert.match(s.url, /^https:\/\//);
    assert.ok(Array.isArray(m.payloads) && Array.isArray(m.objectives) && Array.isArray(m.achievements));
  }
});

// ---- the validator really catches mistakes (so a green result means something) ----

test('validator: rejects a duplicate id, a bad range, a missing source, and a non-https link', () => {
  const base = findMission('apollo-11') as Mission;
  assert.ok(validateCatalogue([base, base]).some((p) => /duplicate id/.test(p)));

  const badLat = clone(base) as LandedMission;
  (badLat.location as { coordinate: { latDeg: number } }).coordinate.latDeg = 91;
  assert.ok(validateCatalogue([badLat]).some((p) => /latitude 91 out of range/.test(p)));

  const badLon = clone(base) as LandedMission;
  (badLon.location as { coordinate: { lonDeg: number } }).coordinate.lonDeg = 200;
  assert.ok(validateCatalogue([badLon]).some((p) => /longitude 200 out of range/.test(p)));

  const noSource = { ...(clone(base) as LandedMission), sources: [] };
  assert.ok(validateCatalogue([noSource]).some((p) => /at least one source/.test(p)));

  const http = clone(base) as LandedMission;
  (http.sources as { url: string }[])[0]!.url = 'http://example.com';
  assert.ok(validateCatalogue([http]).some((p) => /not an https link/.test(p)));
});

test('validator: a failed or planned mission with a surface point is rejected even if the types were bypassed', () => {
  const failed = clone(findMission('peregrine-1') as Mission) as unknown as { location: unknown };
  failed.location = { kind: 'surface-point', regionName: 'x', coordinate: { latDeg: 1, lonDeg: 1, note: 'invented' } };
  assert.ok(validateCatalogue([failed as Mission]).some((p) => /failed attempt cannot have a surface location/.test(p)));

  const planned = clone(findMission('im-2') as Mission) as unknown as { outcome: string; location: unknown };
  planned.outcome = 'planned';
  planned.location = { kind: 'surface-point', regionName: 'x', coordinate: { latDeg: 1, lonDeg: 1, note: 'invented' } };
  const problems = validateCatalogue([planned as unknown as Mission]);
  assert.ok(problems.some((p) => /planned mission cannot have a surface point/.test(p)));
  assert.equal(markerSites([planned as unknown as Mission]).length, 0, 'a planned mission never produces a marker');
});

test('validator: a passive payload cannot be marked operated; a coordinate needs a source note', () => {
  const m = clone(findMission('im-1') as Mission) as LandedMission;
  (m.payloads as { stage: string }[])[5]!.stage = 'operated';
  assert.ok(validateCatalogue([m]).some((p) => /passive payload/.test(p)));
  const n = clone(findMission('im-1') as Mission) as LandedMission;
  (n.location as { coordinate: { note: string } }).coordinate.note = ' ';
  assert.ok(validateCatalogue([n]).some((p) => /no source note/.test(p)));
});

// ---- coordinates -> scene, using the project's single mapping --------------------------

test('scene placement uses latLonToUnit then toScene: IM-1 is far south, a hair east of the +X meridian', () => {
  const v = toScene(latLonToUnit(-80.13, 1.44));
  const lat = (-80.13 * Math.PI) / 180;
  const lon = (1.44 * Math.PI) / 180;
  close(Math.hypot(v.x, v.y, v.z), 1);
  close(v.x, Math.cos(lat) * Math.cos(lon)); // lon 0 lies on +X
  close(v.y, Math.sin(lat)); // north is +Y, so the south pole is -Y
  close(v.z, -Math.cos(lat) * Math.sin(lon)); // east is -Z
  assert.ok(v.y < -0.98 && v.z < 0);
});

test('east/west and north/south signs hold for every Apollo marker', () => {
  for (const s of markerSites()) {
    const v = toScene(latLonToUnit(s.latDeg, s.lonDeg));
    assert.equal(Math.sign(v.y), Math.sign(s.latDeg), `${s.id} north/south`);
    if (Math.abs(s.lonDeg) > 1) assert.equal(Math.sign(v.z), -Math.sign(s.lonDeg), `${s.id} east/west`);
  }
});

test('Apollo 17 and Apollo 12 are on opposite sides of the sphere in scene Z (east -Z, west +Z)', () => {
  const a17 = landed('apollo-17').location;
  const a12 = landed('apollo-12').location;
  assert.ok(a17.kind === 'surface-point' && a12.kind === 'surface-point');
  if (a17.kind === 'surface-point' && a12.kind === 'surface-point') {
    assert.ok(toScene(latLonToUnit(a17.coordinate.latDeg, a17.coordinate.lonDeg)).z < 0);
    assert.ok(toScene(latLonToUnit(a12.coordinate.latDeg, a12.coordinate.lonDeg)).z > 0);
  }
});
