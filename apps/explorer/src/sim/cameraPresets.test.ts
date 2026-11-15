import test from 'node:test';
import assert from 'node:assert/strict';
import { dot, norm } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import { moonCameraPose, orbitCameraPose, screenBasis } from './cameraPresets.ts';
import { latLonToUnit, toScene } from './sceneMapping.ts';

/** True if the direction `dir` (scene axes) points to `target` on the screen within `tolDeg`. */
function pointsTo(dir: Vec3, target: Vec3, tolDeg = 2): boolean {
  const c = dot(dir, target) / (norm(dir) * norm(target));
  return Math.acos(Math.min(1, c)) * (180 / Math.PI) < tolDeg;
}

const EAST = toScene(latLonToUnit(0, 90)); // lunar east, scene axes
const NEAR = toScene(latLonToUnit(0, 0));
const NORTH = toScene(latLonToUnit(90, 0));

test('Moon near side: looks toward the Moon centre from longitude 0, north up, east to the right', () => {
  const b = screenBasis(moonCameraPose('nearSide', 4.2));
  assert.ok(pointsTo(b.up, NORTH), 'north is up');
  assert.ok(pointsTo(b.right, EAST), 'east is right');
  assert.ok(dot(b.forward, NEAR) < -0.999, 'the camera looks at the near side');
});

test('Moon far side: north up, east to the LEFT (mirror view of the same sphere)', () => {
  const b = screenBasis(moonCameraPose('farSide', 4.2));
  assert.ok(pointsTo(b.up, NORTH));
  assert.ok(pointsTo(b.right, toScene(latLonToUnit(0, -90))), 'east is on the left');
  assert.ok(dot(b.forward, NEAR) > 0.999, 'looking along +X means the far side faces the camera');
});

test('Moon north pole: camera above the north pole, near side at the BOTTOM, east to the right', () => {
  const pose = moonCameraPose('northPole', 4.2);
  assert.ok(pose.position.y > 4.19, 'camera is above the pole');
  const b = screenBasis(pose);
  assert.ok(dot(b.forward, NORTH) < -0.999, 'looking down onto the north pole');
  assert.ok(pointsTo(b.up, toScene(latLonToUnit(0, 180))), 'the far side is at the top, so the near side is at the bottom');
  assert.ok(pointsTo(b.right, EAST));
});

test('Moon south pole: camera below the south pole, near side at the TOP', () => {
  const pose = moonCameraPose('southPole', 4.2);
  assert.ok(pose.position.y < -4.19);
  const b = screenBasis(pose);
  assert.ok(dot(b.forward, NORTH) > 0.999, 'looking up onto the south pole');
  assert.ok(pointsTo(b.up, NEAR), 'the near side is at the top');
});

test('Orbit north-polar view: celestial north toward the viewer, EQJ +x right and +y up (orbit appears counter-clockwise)', () => {
  const pose = orbitCameraPose('northPolar', 14);
  const b = screenBasis(pose);
  const northEqj = toScene({ x: 0, y: 0, z: 1 });
  assert.ok(dot(b.forward, northEqj) < -0.999, 'looking down the celestial north axis');
  assert.ok(pointsTo(b.right, toScene({ x: 1, y: 0, z: 0 })), 'EQJ +x to the right');
  assert.ok(pointsTo(b.up, toScene({ x: 0, y: 1, z: 0 })), 'EQJ +y up');
  // A point moving from EQJ +x toward EQJ +y goes right-to-up: counter-clockwise on the screen.
  const from = toScene({ x: 1, y: 0, z: 0 });
  const to = toScene({ x: 0, y: 1, z: 0 });
  const screenFrom = [dot(from, b.right), dot(from, b.up)];
  const screenTo = [dot(to, b.right), dot(to, b.up)];
  const crossZ = screenFrom[0]! * screenTo[1]! - screenFrom[1]! * screenTo[0]!;
  assert.ok(crossZ > 0.99, 'counter-clockwise on screen');
});

test('Orbit oblique view looks from the north side at about 55 degrees off the pole, still with north up', () => {
  const pose = orbitCameraPose('oblique', 14);
  const polar = (Math.acos(pose.position.y / norm(pose.position)) * 180) / Math.PI;
  assert.ok(Math.abs(polar - 55) < 1e-9);
  const b = screenBasis(pose);
  assert.ok(dot(b.up, toScene({ x: 0, y: 0, z: 1 })) > 0.5, 'celestial north is toward the top half of the screen');
});

test('all presets sit at the requested distance (so zoom limits behave the same for every preset)', () => {
  for (const p of ['nearSide', 'farSide', 'northPole', 'southPole'] as const) {
    assert.ok(Math.abs(norm(moonCameraPose(p, 4.2).position) - 4.2) < 1e-12);
  }
  for (const p of ['northPolar', 'oblique'] as const) {
    assert.ok(Math.abs(norm(orbitCameraPose(p, 14).position) - 14) < 1e-12);
  }
});
