/**
 * Terrain integration settings and honest status wording (pure maths and text; no Three.js,
 * no browser), so everything here can be tested in Node.
 *
 * UNITS AND EXAGGERATION
 *   The raster is decoded to heights in METRES above the 1737.4 km reference sphere
 *   (lunarElevation.ts). Only at the rendering boundary is a height turned into a scene radius:
 *       sceneRadius = 1 + exaggeration * heightMetres / 1,737,400        (scene unit 1 = Moon radius)
 *   exaggeration 1 is true scale. Anything else is a DISPLAY choice: it changes how the globe is
 *   drawn, never the data, the astronomy, the Earth-Moon distance or any mission coordinate.
 *
 * WHY THE CAP IS 2
 *   Landing-site markers sit at radius 1.012 and the grid at 1.014. The highest pixel in the
 *   LDEM_16 data is +10685.5 m, which at exaggeration E reaches 1 + E * 0.00615. At E = 2 that is
 *   1.0123, so markers would start to sink into the highest peaks; above 2 they would be buried.
 *
 * ORIENTATION (what the code assumes; NOT verified against the real file)
 *   raster row 0 = north edge, column 0 starts at longitude -180 (east to the right);
 *   mesh row 0 = north pole, mesh column 0 = longitude -180, uv.u = (lon + 180) / 360.
 *   Both use the same two assumptions, so the terrain and the colour texture can only disagree
 *   if the real file breaks them. East-west mirroring is therefore still UNVERIFIED until the
 *   browser checklist in docs/TERRAIN_INTEGRATION.md is done.
 */
import type { HeightFootprint } from './lunarElevation.ts';

export const TERRAIN_FILE = 'textures/ldem_16_uint.raw';
export const TERRAIN_RASTER_WIDTH = 5760;
export const TERRAIN_RASTER_HEIGHT = 2880;
export const TERRAIN_RASTER_BYTES = TERRAIN_RASTER_WIDTH * TERRAIN_RASTER_HEIGHT * 2;

/** Globe mesh resolution used for terrain (must equal the segments used to build the mesh). */
export const TERRAIN_MESH_LON_SEGMENTS = 256;
export const TERRAIN_MESH_LAT_SEGMENTS = 128;

export const DEFAULT_TERRAIN_EXAGGERATION = 1.5;
export const MAX_TERRAIN_EXAGGERATION = 2;

/**
 * "?exaggeration=2" in the address bar. Missing, empty or not a number gives the default;
 * a number outside 0..2 is clamped (0 draws the smooth sphere, with terrain reported as active
 * at 0x so the label never hides that).
 */
export function exaggerationFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get('exaggeration');
  if (raw === null || raw.trim() === '') return DEFAULT_TERRAIN_EXAGGERATION;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_TERRAIN_EXAGGERATION;
  return Math.min(MAX_TERRAIN_EXAGGERATION, Math.max(0, value));
}

/**
 * The averaging rule the app uses, exactly as the app has behaved so far: the isotropic footprint
 * is the default, and only "?footprint=current" selects the older rule.
 * (lunarElevation.footprintFromSearch is the separate A/B helper and is left unchanged.)
 */
export function footprintForApp(search: string): HeightFootprint {
  return new URLSearchParams(search).get('footprint') === 'current' ? 'current' : 'isotropic';
}

/** null when the byte length is right, otherwise a plain-English reason. */
export function checkElevationByteLength(byteLength: number): string | null {
  if (byteLength === TERRAIN_RASTER_BYTES) return null;
  return (
    `The elevation file is ${byteLength.toLocaleString('en-US')} bytes, but a ${TERRAIN_RASTER_WIDTH} x ${TERRAIN_RASTER_HEIGHT} ` +
    `16-bit raster is ${TERRAIN_RASTER_BYTES.toLocaleString('en-US')} bytes. ` +
    'It may be the wrong file, or the dev server returned a web page instead of the data.'
  );
}

export type TerrainStatus =
  | { readonly state: 'loading' }
  | {
      readonly state: 'active';
      readonly exaggeration: number;
      readonly minHeightMetres: number;
      readonly maxHeightMetres: number;
      readonly footprint: HeightFootprint;
    }
  | { readonly state: 'unavailable'; readonly reason: string };

export interface TerrainStatusView {
  readonly label: string;
  readonly title: string;
  readonly tone: 'info' | 'ok' | 'warn';
}

export function describeTerrainStatus(status: TerrainStatus): TerrainStatusView {
  switch (status.state) {
    case 'loading':
      return {
        label: 'Terrain: loading',
        title: 'Loading the NASA LRO LOLA elevation file. The Moon is smooth until it has loaded.',
        tone: 'info',
      };
    case 'active': {
      const x = status.exaggeration;
      const scale = x === 1 ? 'true scale' : x === 0 ? 'relief OFF (0x)' : `relief exaggerated ${x}x`;
      return {
        label: `Terrain: LOLA active, ${scale}`,
        title:
          `NASA LRO LOLA LDEM_16 elevation (about 1.9 km per pixel), heights ${status.minHeightMetres.toFixed(0)} m to ` +
          `${status.maxHeightMetres.toFixed(0)} m above the 1737.4 km reference sphere (not sea level). ` +
          (x === 1 ? 'Drawn at true scale.' : `The drawn relief is exaggerated ${x}x for visibility; the data is not changed.`) +
          ` Averaging rule: ${status.footprint}. East-west orientation of the data is not yet verified.`,
        tone: 'ok',
      };
    }
    case 'unavailable':
      return {
        label: 'Terrain: unavailable (smooth sphere)',
        title: `Real terrain is NOT shown. ${status.reason}`,
        tone: 'warn',
      };
  }
}
