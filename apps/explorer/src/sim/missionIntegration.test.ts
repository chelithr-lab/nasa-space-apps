import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, findMission, markerSites } from './missionCatalogue.ts';
import type { FailedMission, Mission } from './missionCatalogue.ts';
import { LANDING_SITES, landingSiteFromMission, landingSitesFrom } from './landingSites.ts';
import {
  NO_RESULT_TEXT,
  PAYLOAD_STEPS,
  dossierTabs,
  formatCoordinate,
  formatDateLong,
  formatWhen,
  keyFacts,
  locationView,
  missionDateLabel,
  outcomeTone,
  payloadStatus,
  payloadView,
  sourceViews,
  timelineView,
} from './missionDossierModel.ts';
import { MARKER_COLOURS, MARKER_SURFACE_OFFSET, markerKind, markerScenePosition } from './missionMarker.ts';
import { heightToSceneRadius } from './lunarElevation.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';

const mission = (id: string): Mission => {
  const m = findMission(id);
  assert.ok(m, `${id} missing`);
  return m;
};

// ---- catalogue -> markers (what the renderer receives) ------------------------------------

test('LANDING_SITES is generated from the catalogue: exactly the missions with a landing AND a printed coordinate', () => {
  assert.deepEqual(
    LANDING_SITES.map((s) => s.id),
    markerSites().map((s) => s.id),
  );
  assert.deepEqual(LANDING_SITES.map((s) => s.id), ['apollo-11', 'apollo-12', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17', 'im-1']);
});

test('no marker exists for a failed mission, or for a landing without a printed coordinate', () => {
  const ids = LANDING_SITES.map((s) => s.id);
  for (const id of ['peregrine-1', 'blue-ghost-1', 'im-2']) {
    assert.ok(!ids.includes(id), `${id} must have no marker`);
    assert.equal(landingSiteFromMission(mission(id)), null);
  }
});

test('a planned mission, or a failed one that somehow carries a point, still gets no marker', () => {
  const fake = JSON.parse(JSON.stringify(mission('im-1'))) as { outcome: string };
  fake.outcome = 'planned';
  assert.equal(landingSiteFromMission(fake as unknown as Mission), null);
  const failed = JSON.parse(JSON.stringify(mission('peregrine-1'))) as { location: unknown };
  failed.location = { kind: 'surface-point', regionName: 'x', coordinate: { latDeg: 1, lonDeg: 1, note: 'invented' } };
  assert.equal(landingSiteFromMission(failed as unknown as Mission), null);
  assert.deepEqual(landingSitesFrom([fake as unknown as Mission, failed as unknown as Mission]), []);
});

test('the LandingSite shape the renderer already uses is unchanged, and every id resolves to a catalogue mission', () => {
  for (const s of LANDING_SITES) {
    assert.deepEqual(Object.keys(s).sort(), ['description', 'id', 'landingDate', 'latitudeDeg', 'longitudeDeg', 'mission', 'name']);
    assert.ok(findMission(s.id), `${s.id} must resolve to a mission (the viewport opens the dossier by this id)`);
    assert.ok(Number.isFinite(s.latitudeDeg) && Math.abs(s.latitudeDeg) <= 90);
    assert.ok(Number.isFinite(s.longitudeDeg) && Math.abs(s.longitudeDeg) <= 180);
  }
});

test('marker coordinates are the catalogue coordinates, not rounded copies; Apollo 11 keeps its existing display name and date style', () => {
  const a11 = LANDING_SITES.find((s) => s.id === 'apollo-11');
  assert.equal(a11?.name, 'Tranquility Base');
  assert.equal(a11?.mission, 'Apollo 11');
  assert.equal(a11?.landingDate, '20 July 1969 (UTC)');
  assert.equal(a11?.latitudeDeg, 0.67416);
  assert.equal(a11?.longitudeDeg, 23.47314);
  const im1 = LANDING_SITES.find((s) => s.id === 'im-1');
  assert.equal(im1?.latitudeDeg, -80.13);
  assert.equal(im1?.longitudeDeg, 1.44);
  assert.equal(im1?.landingDate, '22 February 2024');
});

// ---- wording helpers ------------------------------------------------------------------------

test('dates: long form, and timeline times keep the offset they were printed with', () => {
  assert.equal(formatDateLong('1972-12-11'), '11 December 1972');
  assert.equal(formatDateLong('not a date'), 'not a date');
  assert.equal(formatWhen('2024-02-22T18:24:00-05:00'), '22 February 2024, 18:24 (UTC\u221205:00)');
  assert.equal(formatWhen('2024-01-18T20:50:00Z'), '18 January 2024, 20:50 (UTC)');
  assert.equal(formatWhen('2025-03-16'), '16 March 2025');
});

test('coordinates: hemisphere letters follow the signs (south and west are negative)', () => {
  assert.equal(formatCoordinate({ latDeg: -80.13, lonDeg: 1.44, note: 'x' }).text, '80.13\u00B0 S, 1.44\u00B0 E');
  assert.equal(formatCoordinate({ latDeg: -3.0128, lonDeg: -23.4219, note: 'x' }).text, '3.0128\u00B0 S, 23.4219\u00B0 W');
  assert.equal(formatCoordinate({ latDeg: 20.1911, lonDeg: 30.7723, note: 'x' }).text, '20.1911\u00B0 N, 30.7723\u00B0 E');
});

// ---- what the dossier says, mission by mission ------------------------------------------------

test('location text: marker missions print a coordinate; region-only and failed missions say why there is no marker', () => {
  const im1 = locationView(mission('im-1'));
  assert.equal(im1.hasMarker, true);
  assert.equal(im1.coordinates, '80.13\u00B0 S, 1.44\u00B0 E');

  const bg = locationView(mission('blue-ghost-1'));
  assert.equal(bg.hasMarker, false);
  assert.equal(bg.coordinates, undefined);
  assert.match(bg.markerNote, /no coordinates/i);
  assert.match(bg.markerNote, /none were estimated/i);

  const im2 = locationView(mission('im-2'));
  assert.equal(im2.hasMarker, false);
  assert.equal(im2.coordinates, undefined);

  const p = locationView(mission('peregrine-1'));
  assert.equal(p.hasMarker, false);
  assert.equal(p.place, undefined);
  assert.match(p.markerNote, /never reached the lunar surface/i);
});

test('status wording: a failed attempt, a partial and a full success cannot be confused', () => {
  assert.equal(outcomeTone(mission('peregrine-1')), 'failed');
  assert.equal(outcomeTone(mission('im-1')), 'partial');
  assert.equal(outcomeTone(mission('im-2')), 'partial');
  assert.equal(outcomeTone(mission('blue-ghost-1')), 'confirmed');
  assert.match(missionDateLabel(mission('peregrine-1')), /^Launched 8 January 2024/);
  assert.match(missionDateLabel(mission('apollo-11')), /^Landed 20 July 1969/);
});

test('tabs: Overview and Sources always exist; Payloads and Timeline only when there is content', () => {
  for (const m of MISSIONS) {
    const ids = dossierTabs(m).map((t) => t.id);
    assert.equal(ids[0], 'overview');
    assert.equal(ids[ids.length - 1], 'sources');
  }
  const peregrine = dossierTabs(mission('peregrine-1')).map((t) => t.id);
  assert.ok(!peregrine.includes('payloads'), 'Peregrine has no sourced payload list, so no empty payload tab');
  assert.equal(dossierTabs(mission('blue-ghost-1')).find((t) => t.id === 'payloads')?.count, 10);
  assert.equal(dossierTabs(mission('im-2')).find((t) => t.id === 'payloads')?.count, 3);
});

test('key facts: missing facts say so instead of vanishing, and a coordinate appears only where a source printed one', () => {
  const facts = (id: string) => Object.fromEntries(keyFacts(mission(id)).map((f) => [f.label, f]));
  assert.equal(facts('im-1')['Coordinates']?.value, '80.13\u00B0 S, 1.44\u00B0 E');
  assert.equal(facts('im-1')['Spacecraft']?.value, 'Odysseus');
  assert.equal(facts('blue-ghost-1')['Coordinates']?.value, 'Not established');
  assert.equal(facts('blue-ghost-1')['Coordinates']?.missing, true);
  assert.equal(facts('peregrine-1')['Site']?.value, 'No surface location');
  assert.equal(facts('apollo-11')['Spacecraft']?.missing, true, 'Apollo spacecraft names are not in the catalogue yet');
  assert.equal(facts('apollo-11')['Date']?.value, '20 July 1969');
});

test('a record with every optional field empty still produces a valid dossier model (no crash, no padding)', () => {
  const bare = {
    ...(JSON.parse(JSON.stringify(mission('peregrine-1'))) as FailedMission),
    objectives: [],
    payloads: [],
    timeline: [],
    achievements: [],
    limitations: [],
    unverified: [],
    launchDate: undefined,
    spacecraft: undefined,
  } as FailedMission;
  assert.deepEqual(dossierTabs(bare).map((t) => t.id), ['overview', 'sources']);
  assert.equal(missionDateLabel(bare), 'date not recorded');
  assert.deepEqual(timelineView(bare.timeline), []);
  const facts = keyFacts(bare);
  assert.ok(facts.filter((f) => f.missing).length >= 3);
});

// ---- payloads: planned, attempted and confirmed stay apart ------------------------------------------

test('payload status: planned, delivered, activated and operated map to different words and tracker steps', () => {
  const base = { id: 'x', name: 'X', purpose: 'p' } as const;
  assert.deepEqual([payloadStatus({ ...base, stage: 'planned' }).label, payloadStatus({ ...base, stage: 'planned' }).step], ['Planned', 0]);
  assert.equal(payloadStatus({ ...base, stage: 'delivered' }).step, 1);
  assert.equal(payloadStatus({ ...base, stage: 'delivered', passive: true }).tone, 'passive');
  assert.equal(payloadStatus({ ...base, stage: 'activated' }).step, 2);
  assert.notEqual(payloadStatus({ ...base, stage: 'activated' }).tone, 'confirmed', 'activated is never shown as confirmed');
  assert.equal(payloadStatus({ ...base, stage: 'operated', result: 'r' }).tone, 'confirmed');
  assert.equal(payloadStatus({ ...base, stage: 'operated', achievement: 'partial' }).tone, 'partial');
  assert.equal(payloadStatus({ ...base, stage: 'operated', achievement: 'not-achieved' }).tone, 'failed');
  assert.deepEqual([...PAYLOAD_STEPS], ['Planned', 'Delivered', 'Activated', 'Operated']);
});

test('real payloads: IM-1 SCALPSS is partial, IM-2 drill is activated only, IM-2 LRA is a passive delivery, Blue Ghost payloads are operated', () => {
  const st = (mid: string, pid: string) => payloadStatus(mission(mid).payloads.find((p) => p.id === pid)!);
  assert.equal(st('im-1', 'im-1-scalpss').tone, 'partial');
  assert.equal(st('im-2', 'im2-trident').step, 2);
  assert.equal(st('im-2', 'im2-lra').tone, 'passive');
  assert.equal(st('im-1', 'im-1-lra').tone, 'passive');
  for (const p of mission('blue-ghost-1').payloads) assert.equal(payloadStatus(p).step, 3, p.id);
});

test('payload view: a missing result is stated as missing; an objective appears only when a source gave one', () => {
  const noResult = payloadView({ id: 'x', name: 'X', purpose: 'p', stage: 'planned' });
  assert.equal(noResult.hasResult, false);
  assert.equal(noResult.result, NO_RESULT_TEXT);
  assert.equal(noResult.objective, undefined);
  const withObjective = payloadView({ id: 'y', name: 'Y', purpose: 'p', objective: 'Measure heat flow.', stage: 'operated', result: 'r' });
  assert.equal(withObjective.objective, 'Measure heat flow.');
  for (const m of MISSIONS) for (const p of m.payloads) assert.equal(payloadView(p).objective, p.objective);
});

test('sources: every link is https with a verification label; titles are non-empty', () => {
  for (const m of MISSIONS) {
    for (const s of sourceViews(m.sources)) {
      assert.match(s.url, /^https:\/\//);
      assert.match(s.verifiedLabel, /^read \d{1,2} \w+ \d{4}$/);
      assert.ok(s.title.length > 0);
    }
  }
});

// ---- marker placement and style ---------------------------------------------------------------------

test('marker position: uses the project mapping, at the offset radius, for every marker', () => {
  for (const site of LANDING_SITES) {
    const p = markerScenePosition(site.latitudeDeg, site.longitudeDeg);
    const u = toScene(latLonToUnit(site.latitudeDeg, site.longitudeDeg));
    assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - MARKER_SURFACE_OFFSET) < 1e-12, site.id);
    assert.ok(Math.abs(p.x / MARKER_SURFACE_OFFSET - u.x) < 1e-12 && Math.abs(p.y / MARKER_SURFACE_OFFSET - u.y) < 1e-12 && Math.abs(p.z / MARKER_SURFACE_OFFSET - u.z) < 1e-12, site.id);
  }
});

test('marker reference point: IM-1 is far south (-Y) and a hair east of +X (east is -Z); Apollo 12 is west (+Z)', () => {
  const im1 = markerScenePosition(-80.13, 1.44);
  assert.ok(im1.y < -0.98 && im1.z < 0 && im1.x > 0);
  const a12 = LANDING_SITES.find((s) => s.id === 'apollo-12')!;
  assert.ok(markerScenePosition(a12.latitudeDeg, a12.longitudeDeg).z > 0);
});

test('marker clears the highest terrain (LROC: +10,786 m) yet floats less than 2 percent of the Moon radius', () => {
  assert.ok(MARKER_SURFACE_OFFSET > heightToSceneRadius(10786));
  assert.ok(MARKER_SURFACE_OFFSET < 1.02);
});

test('marker style: a full success and a partial success have different colours; every colour is paired with a dark outline', () => {
  assert.equal(markerKind('success'), 'confirmed');
  assert.equal(markerKind('partial'), 'partial');
  assert.notEqual(MARKER_COLOURS.confirmed.accent, MARKER_COLOURS.partial.accent);
  for (const k of ['confirmed', 'partial'] as const) {
    const c = MARKER_COLOURS[k];
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    assert.ok(lum(c.accent) > 0.55, `${k} accent is bright (reads on dark maria)`);
    assert.ok(lum(c.outline) < 0.08, `${k} outline is dark (reads on bright highlands)`);
  }
});
