/**
 * Camera presets for the two views (pure maths, in SCENE axes: +Y is up).
 *
 * A camera preset is a camera position (the camera always looks at the origin)
 * plus an "up" hint. Presets are CAMERA PLACEMENTS: they never change the
 * astronomical state. `screenBasis` reproduces the standard look-at maths so
 * tests can verify which scene direction ends up pointing right and up on
 * the screen.
 *
 * Moon view (scene axes: north +Y, longitude 0 on +X, east on -Z):
 *   nearSide  - camera on +X; north up, east to the right.
 *   farSide   - camera on -X; north up, east to the left.
 *   northPole - camera above the north pole, 0.5 degrees off the axis so the
 *               screen orientation is defined; near side at the BOTTOM.
 *   southPole - camera below the south pole; near side at the TOP.
 *
 * Orbit view (Earth-centred, EQJ axes mapped by toScene):
 *   northPolar - camera on the celestial-north side looking down, EQJ +x to the
 *                right and EQJ +y up on the screen, so the Moon's orbit
 *                appears counter-clockwise, as seen from above the north pole.
 *   oblique    - the same scene seen from about 55 degrees off the pole.
 */
import { cross, normalize, scale, vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';

export interface CameraPose {
  position: Vec3;
  up: Vec3;
}

export type MoonCameraPreset = 'nearSide' | 'farSide' | 'northPole' | 'southPole';
export type OrbitCameraPreset = 'northPolar' | 'oblique';

const TILT = (0.5 * Math.PI) / 180;
const UP = vec3(0, 1, 0);

export function moonCameraPose(preset: MoonCameraPreset, distance: number): CameraPose {
  const d = distance;
  switch (preset) {
    case 'nearSide':
      return { position: vec3(d, 0, 0), up: UP };
    case 'farSide':
      return { position: vec3(-d, 0, 0), up: UP };
    case 'northPole':
      return { position: vec3(d * Math.sin(TILT), d * Math.cos(TILT), 0), up: UP };
    case 'southPole':
      return { position: vec3(d * Math.sin(TILT), -d * Math.cos(TILT), 0), up: UP };
  }
}

export function orbitCameraPose(preset: OrbitCameraPreset, distance: number): CameraPose {
  const d = distance;
  switch (preset) {
    case 'northPolar':
      return { position: vec3(0, d * Math.cos(TILT), d * Math.sin(TILT)), up: UP };
    case 'oblique': {
      const polar = (55 * Math.PI) / 180;
      const azimuth = (25 * Math.PI) / 180;
      return {
        position: vec3(d * Math.sin(polar) * Math.sin(azimuth), d * Math.cos(polar), d * Math.sin(polar) * Math.cos(azimuth)),
        up: UP,
      };
    }
  }
}

/** Screen axes (unit vectors in scene axes) for a camera at `pose.position` looking at the origin. */
export function screenBasis(pose: CameraPose): { right: Vec3; up: Vec3; forward: Vec3 } {
  const forward = normalize(scale(pose.position, -1));
  const right = normalize(cross(forward, pose.up));
  const up = cross(right, forward);
  return { right, up, forward };
}
