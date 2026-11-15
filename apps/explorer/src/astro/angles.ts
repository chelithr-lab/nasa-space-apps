/**
 * Angle helpers. All public angles in this module are in DEGREES unless a
 * name says otherwise. Pure functions, no dependencies.
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Wrap an angle into the half-open range [0, 360). */
export function normalizeDeg360(deg: number): number {
  let r = deg % 360;
  if (r < 0) r += 360;
  // A tiny negative input (e.g. -1e-17) becomes exactly 360 after "+= 360"
  // in floating point. Keep the range half-open.
  if (r >= 360) r = 0;
  // -360 % 360 is negative zero in JavaScript; never return -0.
  return r === 0 ? 0 : r;
}

/** Wrap an angle into the half-open range (-180, +180]. */
export function normalizeDegSigned180(deg: number): number {
  const r = normalizeDeg360(deg);
  return r > 180 ? r - 360 : r;
}

/** Signed difference a - b, wrapped into (-180, +180]. */
export function signedAngleDiffDeg(a: number, b: number): number {
  return normalizeDegSigned180(a - b);
}
