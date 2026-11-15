/**
 * Where a mission marker sits and how it is styled (pure maths, no Three.js, no browser).
 *
 * Placement uses the project's single mapping, latLonToUnit() then toScene(), so a marker
 * can never disagree with the globe, the graticule or the camera presets.
 */
import { latLonToUnit, toScene } from './sceneMapping.ts';
import type { Vec3 } from '../astro/vec3.ts';
import type { LandedMission } from './missionCatalogue.ts';

/**
 * Marker centre as a multiple of the Moon's radius. It must clear the highest terrain
 * (about +10.8 km = 1.0062 in these units) so no marker can sink into a mountain, and stay
 * small so the marker does not appear to float away from its site at an angle.
 */
export const MARKER_SURFACE_OFFSET = 1.012;

/** Scene position of a marker for a latitude/longitude (degrees, north- and east-positive). */
export function markerScenePosition(latDeg: number, lonDeg: number, offset = MARKER_SURFACE_OFFSET): Vec3 {
  const v = toScene(latLonToUnit(latDeg, lonDeg));
  return { x: v.x * offset, y: v.y * offset, z: v.z * offset };
}

export type MarkerKind = 'confirmed' | 'partial';

/** A full success and a partial success must be told apart at a glance. */
export function markerKind(outcome: LandedMission['outcome']): MarkerKind {
  return outcome === 'success' ? 'confirmed' : 'partial';
}

/** Marker colours (sRGB hex). Each is a bright accent drawn inside a dark outline. */
export const MARKER_COLOURS: Readonly<Record<MarkerKind, { readonly accent: string; readonly outline: string }>> = {
  confirmed: { accent: '#53e0f2', outline: '#04101d' },
  partial: { accent: '#ffc15a', outline: '#04101d' },
};
