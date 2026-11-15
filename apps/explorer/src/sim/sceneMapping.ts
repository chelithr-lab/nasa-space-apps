/**
 * The ONE place that defines how astronomy axes become Three.js scene axes.
 *
 * Astronomy frames used in this app (EQJ, Earth-fixed, Moon-fixed) are
 * right-handed with z pointing NORTH. Three.js scenes are right-handed with
 * +Y pointing UP on screen. We therefore map
 *
 *     scene.x =  astro.x
 *     scene.y =  astro.z      (north is up)
 *     scene.z = -astro.y
 *
 * This is a proper rotation (determinant +1), so no mirror images appear.
 * It is applied identically in both 3D views.
 *
 * Consequence for the Moon: longitude 0 / latitude 0 lies on +X, east
 * longitude +90 lies on -Z, and the north pole on +Y. A standard
 * equirectangular map centred on longitude 0 with east to the right wraps
 * onto a Three.js SphereGeometry with NO extra rotation.
 *
 * Pure maths: no Three.js import, so it can be tested in Node.
 */
import { DEG2RAD } from '../astro/angles.ts';
import { mulMat3, transpose, vec3 } from '../astro/vec3.ts';
import type { Mat3, Vec3 } from '../astro/vec3.ts';

/** Matrix form of the mapping, scene = P * astro. */
export const SCENE_FROM_ASTRO: Mat3 = [
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
];

/** Astronomy-axes vector to scene-axes vector. */
export function toScene(v: Vec3): Vec3 {
  return { x: v.x, y: v.z, z: -v.y };
}

/** Scene-axes vector back to astronomy axes. */
export function fromScene(v: Vec3): Vec3 {
  return { x: v.x, y: -v.z, z: v.y };
}

/**
 * Unit vector for a latitude/longitude (degrees) in a body-fixed astronomy
 * frame: x toward (lat 0, lon 0), y toward lon +90 east, z toward north.
 */
export function latLonToUnit(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const c = Math.cos(lat);
  return vec3(c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat));
}

/**
 * Re-express a rotation given in astronomy axes (A) in scene axes: P A P^T.
 * Use it for a model whose vertices are ALREADY in scene axes.
 */
export function sceneRotationFromAstro(a: Mat3): Mat3 {
  return mulMat3(mulMat3(SCENE_FROM_ASTRO, a), transpose(SCENE_FROM_ASTRO));
}

/**
 * Rotation that turns an Earth-fixed model (vertices in scene axes, built from
 * Earth-fixed astronomy coordinates through toScene) into its orientation in
 * the EQJ-based scene. `eqjToEarthFixed` is AstroState.earth.eqjToEarthFixed
 * (v_ef = M v_eqj), so the model needs M^T (Earth-fixed to EQJ).
 */
export function earthModelRotation(eqjToEarthFixed: Mat3): Mat3 {
  return sceneRotationFromAstro(transpose(eqjToEarthFixed));
}

/**
 * Flat 16-number COLUMN-MAJOR array for THREE.Matrix4.fromArray(), carrying a
 * pure rotation (no translation, no scale).
 */
export function mat3ToMatrix4ColumnMajor(m: Mat3): number[] {
  return [
    m[0][0], m[1][0], m[2][0], 0,
    m[0][1], m[1][1], m[2][1], 0,
    m[0][2], m[1][2], m[2][2], 0,
    0, 0, 0, 1,
  ];
}
