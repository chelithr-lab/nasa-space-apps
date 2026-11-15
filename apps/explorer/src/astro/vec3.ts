/**
 * Minimal 3-vector and 3x3-matrix maths (right-handed, row-major matrices).
 * Pure functions, no dependencies. Matrices act on column vectors: v' = M v.
 */
import { DEG2RAD, RAD2DEG } from './angles.ts';

export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };
export type Row3 = readonly [number, number, number];
export type Mat3 = readonly [Row3, Row3, Row3];

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function norm(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Unit vector. Throws RangeError for a zero-length or non-finite vector. */
export function normalize(v: Vec3): Vec3 {
  const n = norm(v);
  if (!Number.isFinite(n) || n === 0) {
    throw new RangeError('Cannot normalise a zero-length or non-finite vector.');
  }
  return scale(v, 1 / n);
}

/**
 * Angle between two vectors in degrees, range [0, 180].
 * Uses atan2(|a x b|, a . b), which stays accurate for very small angles
 * (acos of a dot product loses precision near 0 and 180 degrees).
 */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b)) * RAD2DEG;
}

export function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

export function transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

function dotRow(a: Row3, b: Row3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Matrix product a * b (apply b first, then a). */
export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const bt = transpose(b);
  const row = (r: Row3): Row3 => [dotRow(r, bt[0]), dotRow(r, bt[1]), dotRow(r, bt[2])];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** Matrix whose COLUMNS are the three given vectors. */
export function matFromColumns(c0: Vec3, c1: Vec3, c2: Vec3): Mat3 {
  return [
    [c0.x, c1.x, c2.x],
    [c0.y, c1.y, c2.y],
    [c0.z, c1.z, c2.z],
  ];
}

export function det3(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** True if m is a proper rotation: orthonormal rows and determinant +1. */
export function isRotationMatrix(m: Mat3, tolerance = 1e-6): boolean {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const ri = m[i];
      const rj = m[j];
      if (ri === undefined || rj === undefined) return false;
      const expected = i === j ? 1 : 0;
      if (!(Math.abs(dotRow(ri, rj) - expected) <= tolerance)) return false;
    }
  }
  return Math.abs(det3(m) - 1) <= tolerance;
}

/**
 * Coordinate rotation about the z axis by +angleDeg.
 * Applied to a vector's coordinates it gives the coordinates of the SAME
 * vector in a frame whose axes are rotated counter-clockwise (seen from +z)
 * by angleDeg:
 *     x' =  x cos(a) + y sin(a)
 *     y' = -x sin(a) + y cos(a)
 *     z' =  z
 * This is exactly the step from "equator of date" coordinates to
 * Earth-fixed coordinates when angleDeg is the Greenwich sidereal angle.
 */
export function rotZCoordinate(angleDeg: number): Mat3 {
  const a = angleDeg * DEG2RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
}
