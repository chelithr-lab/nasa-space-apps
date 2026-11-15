/**
 * Is a point hidden behind a sphere as seen from the camera? (pure maths)
 * Used to hide text labels that belong to the far side of the Moon or Earth.
 */
import { dot, sub } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';

/** True if the straight segment from `from` to `to` passes through the sphere's interior. */
export function segmentHitsSphere(from: Vec3, to: Vec3, center: Vec3, radius: number): boolean {
  const d = sub(to, from);
  const f = sub(from, center);
  const a = dot(d, d);
  if (a === 0) return false;
  const b = 2 * dot(f, d);
  const c = dot(f, f) - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return false;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return t1 < 1 && t2 > 0;
}
