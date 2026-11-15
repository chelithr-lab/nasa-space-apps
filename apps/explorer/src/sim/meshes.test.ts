import test from 'node:test';
import assert from 'node:assert/strict';
import { vec3 } from '../astro/vec3.ts';
import { buildGraticule } from './graticule.ts';
import { segmentHitsSphere } from './occlusion.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';
import { buildLatLonSphere } from './sphereMesh.ts';

test('sphere: every vertex is at the requested radius and normals are unit outward', () => {
  const m = buildLatLonSphere(2.5, 24, 12);
  assert.equal(m.vertexCount, 25 * 13);
  for (let i = 0; i < m.vertexCount; i++) {
    const r = Math.hypot(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!);
    assert.ok(Math.abs(r - 2.5) < 1e-5, `radius ${r}`);
    const n = Math.hypot(m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!);
    assert.ok(Math.abs(n - 1) < 1e-5);
  }
});

test('sphere: u,v encode longitude and latitude (u=0.5 is lon 0, east to the right; v=1 is the north pole)', () => {
  const lonSeg = 36;
  const latSeg = 18;
  const m = buildLatLonSphere(1, lonSeg, latSeg);
  const cols = lonSeg + 1;
  let checked = 0;
  for (let r = 0; r <= latSeg; r++) {
    for (let c = 0; c <= lonSeg; c++) {
      const i = r * cols + c;
      const u = m.uvs[i * 2]!;
      const v = m.uvs[i * 2 + 1]!;
      const lat = -90 + 180 * v;
      const lon = -180 + 360 * u;
      const expected = toScene(latLonToUnit(lat, lon));
      assert.ok(Math.abs(m.positions[i * 3]! - expected.x) < 1e-5);
      assert.ok(Math.abs(m.positions[i * 3 + 1]! - expected.y) < 1e-5);
      assert.ok(Math.abs(m.positions[i * 3 + 2]! - expected.z) < 1e-5);
      checked++;
    }
  }
  assert.equal(checked, cols * (latSeg + 1));
  // Specific anchors: the centre of the image is the +X direction (lon 0, lat 0); the top row is +Y.
  const centre = (latSeg / 2) * cols + lonSeg / 2;
  assert.ok(Math.abs(m.uvs[centre * 2]! - 0.5) < 1e-6 && Math.abs(m.uvs[centre * 2 + 1]! - 0.5) < 1e-6);
  assert.ok(Math.abs(m.positions[centre * 3]! - 1) < 1e-6);
  assert.ok(Math.abs(m.positions[1]! - 1) < 1e-6, 'first row must be the north pole at +Y');
});

test('sphere: all triangles face outward (counter-clockwise seen from outside); only pole slivers are degenerate', () => {
  const m = buildLatLonSphere(1, 32, 16);
  let outward = 0;
  let degenerate = 0;
  for (let t = 0; t < m.triangleCount; t++) {
    const ia = m.indices[t * 3]!;
    const ib = m.indices[t * 3 + 1]!;
    const ic = m.indices[t * 3 + 2]!;
    const p = (i: number) => vec3(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!);
    const a = p(ia);
    const b = p(ib);
    const c = p(ic);
    const e1 = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
    const e2 = vec3(c.x - a.x, c.y - a.y, c.z - a.z);
    const n = vec3(e1.y * e2.z - e1.z * e2.y, e1.z * e2.x - e1.x * e2.z, e1.x * e2.y - e1.y * e2.x);
    const area = Math.hypot(n.x, n.y, n.z);
    if (area < 1e-9) {
      degenerate++;
      continue;
    }
    const centroid = vec3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    const facing = n.x * centroid.x + n.y * centroid.y + n.z * centroid.z;
    assert.ok(facing > 0, `triangle ${t} faces inward`);
    outward++;
  }
  assert.equal(degenerate, 2 * 32, 'one collapsed triangle per longitude segment at each pole');
  assert.equal(outward + degenerate, m.triangleCount);
});

test('sphere: invalid sizes are rejected', () => {
  assert.throws(() => buildLatLonSphere(1, 2, 8), RangeError);
  assert.throws(() => buildLatLonSphere(0, 8, 8), RangeError);
  assert.throws(() => buildLatLonSphere(1, 8.5, 8), RangeError);
});

test('graticule: all points on the sphere; prime meridian at z=0 and x>=0; equator at y=0', () => {
  const g = buildGraticule(1.01, 30);
  for (const arr of [g.minor, g.equator, g.primeMeridian]) {
    assert.ok(arr.length > 0 && arr.length % 6 === 0, 'segments come in pairs of 3-vectors');
    for (let i = 0; i < arr.length; i += 3) {
      assert.ok(Math.abs(Math.hypot(arr[i]!, arr[i + 1]!, arr[i + 2]!) - 1.01) < 1e-5);
    }
  }
  for (let i = 0; i < g.primeMeridian.length; i += 3) {
    assert.ok(Math.abs(g.primeMeridian[i + 2]!) < 1e-6, 'prime meridian lies in the scene x-y plane');
    assert.ok(g.primeMeridian[i]! >= -1e-6, 'prime meridian is on the +X side');
  }
  for (let i = 0; i < g.equator.length; i += 3) assert.ok(Math.abs(g.equator[i + 1]!) < 1e-6);
});

test('graticule: minor lines exclude the equator and prime meridian, and spacing must divide 90', () => {
  const g = buildGraticule(1, 30, 96);
  // 11 other meridians (12 total minus the prime one) of 48 segments, plus 4 parallels (+-30, +-60) of 96 segments.
  assert.equal(g.minor.length / 6, 11 * 48 + 4 * 96);
  assert.throws(() => buildGraticule(1, 25), RangeError);
  assert.throws(() => buildGraticule(-1, 30), RangeError);
});

test('occlusion: a point on the far side of a sphere is hidden, a near-side or sideways point is not', () => {
  const c = vec3(0, 0, 0);
  const cam = vec3(10, 0, 0);
  assert.equal(segmentHitsSphere(cam, vec3(-1.06, 0, 0), c, 1), true, 'far side hidden');
  assert.equal(segmentHitsSphere(cam, vec3(1.06, 0, 0), c, 1), false, 'near side visible');
  assert.equal(segmentHitsSphere(cam, vec3(0, 3, 0), c, 1), false, 'clear of the sphere');
  assert.equal(segmentHitsSphere(cam, vec3(-3, 0, 0), c, 1), true, 'object behind the sphere hidden');
  assert.equal(segmentHitsSphere(cam, vec3(20, 0, 0), c, 1), false, 'point beyond the camera');
  assert.equal(segmentHitsSphere(cam, cam, c, 1), false, 'zero-length segment');
});
