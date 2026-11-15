import * as THREE from 'three';
import type { LandingSite } from '../sim/landingSites.ts';
import { findMission } from '../sim/missionCatalogue.ts';
import { markerKind, markerScenePosition } from '../sim/missionMarker.ts';
import { MARKER_TEXTURE_PIXELS, drawMissionMarker } from './markerArt.ts';
import type { MarkerKind } from '../sim/missionMarker.ts';

/**
 * Mission waypoint markers for the 3D Moon.
 *
 * Each marker is ONE Sprite (a camera-facing picture), so:
 *  - it stays legible from every angle, including near the limb and over the poles;
 *  - it keeps the same size on screen as you zoom (sizeAttenuation off);
 *  - it is a single object, which is what moonScene.ts's non-recursive raycast expects;
 *  - the Moon hides it on the far side through the normal depth test (the click check in
 *    moonScene.ts is unchanged).
 * The picture is a bright accent drawn inside a dark outline, so it reads on bright
 * highlands and on dark maria alike. Full success is cyan, partial success is amber.
 *
 * The returned objects carry `userData.landingSite`, as before.
 */

export interface LandingSiteMarker {
  readonly site: LandingSite;
  readonly object: THREE.Sprite;
}

/** Marker height as a fraction of the camera distance (about 5-6 percent of the view height). */
const MARKER_SCREEN_SIZE = 0.036;

const textureCache = new Map<MarkerKind, THREE.CanvasTexture>();
const materialCache = new Map<MarkerKind, THREE.SpriteMaterial>();

function drawMarker(kind: MarkerKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_TEXTURE_PIXELS;
  canvas.height = MARKER_TEXTURE_PIXELS;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) drawMissionMarker(ctx, kind);
  return canvas;
}

function materialFor(kind: MarkerKind): THREE.SpriteMaterial {
  const cached = materialCache.get(kind);
  if (cached !== undefined) return cached;
  const texture = new THREE.CanvasTexture(drawMarker(kind));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({
    map: texture,
    sizeAttenuation: false, // constant on-screen size while zooming
    depthTest: true, // the Moon hides markers on the far side
    depthWrite: false,
    transparent: true,
  });
  textureCache.set(kind, texture);
  materialCache.set(kind, material);
  return material;
}

export function createLandingSiteMarkers(sites: readonly LandingSite[]): LandingSiteMarker[] {
  return sites.map((site) => {
    const mission = findMission(site.id);
    const kind: MarkerKind = mission !== undefined && (mission.outcome === 'success' || mission.outcome === 'partial') ? markerKind(mission.outcome) : 'partial';
    const sprite = new THREE.Sprite(materialFor(kind));
    const p = markerScenePosition(site.latitudeDeg, site.longitudeDeg);
    sprite.position.set(p.x, p.y, p.z);
    sprite.scale.set(MARKER_SCREEN_SIZE, MARKER_SCREEN_SIZE, 1);
    sprite.renderOrder = 10;
    sprite.name = `mission-marker-${site.id}`;
    sprite.userData.landingSite = site;
    return { site, object: sprite };
  });
}

/** Release the shared textures and materials (call when the scene is disposed). */
export function disposeLandingSiteMarkers(): void {
  for (const t of textureCache.values()) t.dispose();
  for (const m of materialCache.values()) m.dispose();
  textureCache.clear();
  materialCache.clear();
}
