/**
 * Our own latitude/longitude sphere mesh (pure maths, no Three.js import).
 *
 * Why not THREE.SphereGeometry? Its texture layout is a Three.js convention.
 * Building the mesh here from the app's own lat/lon definition means the
 * mapping "texture pixel <-> lunar latitude/longitude" is defined and tested
 * in this project and cannot silently disagree with the coordinate maths.
 *
 * Conventions (body-fixed astronomy frame, then mapped to scene axes by
 * toScene): longitude is east-positive, latitude north-positive.
 *   texture u = (longitude + 180) / 360   -> the image centre is longitude 0,
 *                                            east is to the right
 *   texture v = (latitude + 90) / 180     -> v = 1 is the north pole (top
 *                                            row of the image after Three.js
 *                                            flips the image)
 * This is the layout of equirectangular maps "centred on 0 degrees
 * longitude", such as the NASA SVS CGI Moon Kit colour map.
 *
 * Triangles are wound counter-clockwise when seen from OUTSIDE the sphere
 * (Three.js front faces).
 */
import { latLonToUnit, toScene } from './sceneMapping.ts';

export interface SphereMeshData {
  /** x,y,z per vertex, SCENE axes, scaled by radius. */
  positions: Float32Array;
  /** Outward unit normals, SCENE axes. */
  normals: Float32Array;
  /** u,v per vertex. */
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

export function buildLatLonSphere(radius: number, lonSegments: number, latSegments: number): SphereMeshData {
  if (!Number.isInteger(lonSegments) || !Number.isInteger(latSegments) || lonSegments < 3 || latSegments < 2) {
    throw new RangeError('Sphere needs at least 3 longitude and 2 latitude segments (whole numbers).');
  }
  if (!(radius > 0) || !Number.isFinite(radius)) throw new RangeError('Sphere radius must be positive.');

  const cols = lonSegments + 1; // one extra column duplicates the seam so u can run 0..1
  const rows = latSegments + 1;
  const vertexCount = cols * rows;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  // Row 0 is the NORTH pole (latitude +90), the last row the south pole.
  for (let r = 0; r < rows; r++) {
    const v = 1 - r / latSegments;
    const latDeg = -90 + 180 * v;
    for (let c = 0; c < cols; c++) {
      const u = c / lonSegments;
      const lonDeg = -180 + 360 * u;
      const n = toScene(latLonToUnit(latDeg, lonDeg));
      const i = r * cols + c;
      positions[i * 3] = n.x * radius;
      positions[i * 3 + 1] = n.y * radius;
      positions[i * 3 + 2] = n.z * radius;
      normals[i * 3] = n.x;
      normals[i * 3 + 1] = n.y;
      normals[i * 3 + 2] = n.z;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
  }

  const indexList: number[] = [];
  for (let r = 0; r < latSegments; r++) {
    for (let c = 0; c < lonSegments; c++) {
      const a = r * cols + c; // north-west corner
      const b = a + 1; // north-east
      const d = a + cols; // south-west
      const e = d + 1; // south-east
      // Seen from outside, with north up and east to the right:
      // a -> d -> b is counter-clockwise, and so is b -> d -> e.
      indexList.push(a, d, b, b, d, e);
    }
  }
  const indices = Uint32Array.from(indexList);
  return { positions, normals, uvs, indices, vertexCount, triangleCount: indices.length / 3 };
}
