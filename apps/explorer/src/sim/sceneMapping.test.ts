import test from 'node:test';
import assert from 'node:assert/strict';
import { isRotationMatrix, mulMat3Vec3, vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import {
  SCENE_FROM_ASTRO,
  earthModelRotation,
  fromScene,
  latLonToUnit,
  mat3ToMatrix4ColumnMajor,
  sceneRotationFromAstro,
  toScene,
} from './sceneMapping.ts';

function close(a: Vec3, b: Vec3, tol = 1e-12): void {
  assert.ok(
    Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol,
    `expected (${b.x}, ${b.y}, ${b.z}) got (${a.x}, ${a.y}, ${a.z})`,
  );
}

test('mapping: north is up (+Y), lon 0 is +X, east (+90) is -Z', () => {
  close(toScene(latLonToUnit(90, 0)), vec3(0, 1, 0));
  close(toScene(latLonToUnit(0, 0)), vec3(1, 0, 0));
  close(toScene(latLonToUnit(0, 90)), vec3(0, 0, -1));
  close(toScene(latLonToUnit(0, -90)), vec3(0, 0, 1));
  close(toScene(latLonToUnit(-90, 0)), vec3(0, -1, 0));
});

test('mapping: matrix form agrees with toScene, is a proper rotation, and fromScene inverts it', () => {
  assert.ok(isRotationMatrix(SCENE_FROM_ASTRO));
  for (const v of [vec3(1, 2, 3), vec3(-4, 0.5, 9), vec3(0, 0, 0)]) {
    close(mulMat3Vec3(SCENE_FROM_ASTRO, v), toScene(v));
    close(fromScene(toScene(v)), v);
  }
});

test('mapping keeps handedness: x cross y = z in astronomy axes stays x cross y = z in scene axes', () => {
  const x = toScene(vec3(1, 0, 0));
  const y = toScene(vec3(0, 1, 0));
  const z = toScene(vec3(0, 0, 1));
  close(vec3(x.y * y.z - x.z * y.y, x.z * y.x - x.x * y.z, x.x * y.y - x.y * y.x), z);
});

test('latLonToUnit: unit length and known directions', () => {
  for (const [lat, lon] of [[0, 0], [45, 30], [-80, 170], [12.5, -179.9]] as const) {
    const u = latLonToUnit(lat, lon);
    assert.ok(Math.abs(Math.hypot(u.x, u.y, u.z) - 1) < 1e-12);
  }
  close(latLonToUnit(0, 90), vec3(0, 1, 0));
});

test('earthModelRotation: a model built from Earth-fixed coordinates lands where the EQJ direction says', () => {
  // Pick an arbitrary proper rotation M (EQJ -> Earth-fixed): rotate about z by 50 degrees then about x by 20.
  const a = (50 * Math.PI) / 180;
  const b = (20 * Math.PI) / 180;
  const rz = [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]] as const;
  const rx = [[1, 0, 0], [0, Math.cos(b), Math.sin(b)], [0, -Math.sin(b), Math.cos(b)]] as const;
  const m = [
    [0, 1, 2].map((j) => rx[0][0] * rz[0][j]! + rx[0][1] * rz[1][j]! + rx[0][2] * rz[2][j]!),
    [0, 1, 2].map((j) => rx[1][0] * rz[0][j]! + rx[1][1] * rz[1][j]! + rx[1][2] * rz[2][j]!),
    [0, 1, 2].map((j) => rx[2][0] * rz[0][j]! + rx[2][1] * rz[1][j]! + rx[2][2] * rz[2][j]!),
  ] as unknown as readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
  assert.ok(isRotationMatrix(m));

  const eqjDir = vec3(0.3, -0.5, 0.81);
  const efDir = mulMat3Vec3(m, eqjDir); // direction in Earth-fixed axes
  // A marker fixed on the Earth model sits at toScene(efDir) in the model's own coordinates.
  const modelPoint = toScene(efDir);
  const rotated = mulMat3Vec3(earthModelRotation(m), modelPoint);
  // After the model rotation it must point where the EQJ direction points in the scene.
  close(rotated, toScene(eqjDir), 1e-12);
});

test('sceneRotationFromAstro of the identity is the identity; matrix4 array is column-major with a unit corner', () => {
  const ident = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const;
  const r = sceneRotationFromAstro(ident);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(r[i]![j]! - (i === j ? 1 : 0)) < 1e-15);
  // Column-major: element [row 0][col 1] of the matrix sits at index 4 in the flat array.
  const m = [[0, -1, 0], [1, 0, 0], [0, 0, 1]] as const; // rotation +90 about z
  const flat = mat3ToMatrix4ColumnMajor(m);
  assert.equal(flat.length, 16);
  assert.equal(flat[4], -1); // row 0, column 1
  assert.equal(flat[1], 1); // row 1, column 0
  assert.equal(flat[15], 1);
});
