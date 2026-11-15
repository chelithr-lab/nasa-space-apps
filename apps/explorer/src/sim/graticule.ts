/**
 * Latitude/longitude grid lines for a sphere (pure maths, no Three.js import).
 *
 * Returns flat arrays of line SEGMENT end points (pairs of x,y,z triples) in
 * SCENE axes, ready for THREE.LineSegments. The grid is a coordinate aid
 * derived from geometry; it is not lunar or terrestrial data.
 */
import { latLonToUnit, toScene } from './sceneMapping.ts';

export interface GraticuleData {
  /** Ordinary meridians and parallels. */
  minor: Float32Array;
  /** The equator (latitude 0). */
  equator: Float32Array;
  /** The prime meridian (longitude 0), pole to pole. */
  primeMeridian: Float32Array;
}

function polyline(points: Array<[number, number, number]>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined) continue;
    out.push(...a, ...b);
  }
  return out;
}

function meridian(lonDeg: number, radius: number, steps: number): number[] {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const lat = -90 + (180 * i) / steps;
    const p = toScene(latLonToUnit(lat, lonDeg));
    pts.push([p.x * radius, p.y * radius, p.z * radius]);
  }
  return polyline(pts);
}

function parallel(latDeg: number, radius: number, steps: number): number[] {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const lon = -180 + (360 * i) / steps;
    const p = toScene(latLonToUnit(latDeg, lon));
    pts.push([p.x * radius, p.y * radius, p.z * radius]);
  }
  return polyline(pts);
}

/** `spacingDeg` must divide 90 (for example 10, 15, 30). */
export function buildGraticule(radius: number, spacingDeg = 30, steps = 96): GraticuleData {
  if (!(radius > 0) || !Number.isFinite(radius)) throw new RangeError('Graticule radius must be positive.');
  if (!(spacingDeg > 0) || 90 % spacingDeg !== 0) throw new RangeError('Graticule spacing must divide 90 degrees.');
  const minor: number[] = [];
  for (let lon = -180; lon < 180; lon += spacingDeg) {
    if (lon === 0) continue; // drawn separately as the prime meridian
    minor.push(...meridian(lon, radius, steps / 2));
  }
  for (let lat = -90 + spacingDeg; lat < 90; lat += spacingDeg) {
    if (lat === 0) continue; // drawn separately as the equator
    minor.push(...parallel(lat, radius, steps));
  }
  return {
    minor: Float32Array.from(minor),
    equator: Float32Array.from(parallel(0, radius, steps)),
    primeMeridian: Float32Array.from(meridian(0, radius, steps / 2)),
  };
}
