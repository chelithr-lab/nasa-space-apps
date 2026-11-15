/**
 * Moon surface textures.
 *
 * 1. REAL (optional): if the file public/textures/moon_color_2k.jpg exists it
 *    is used. The intended file is "lroc_color_2k.jpg" from the NASA Scientific
 *    Visualization Studio CGI Moon Kit (https://svs.gsfc.nasa.gov/4720): the LRO
 *    Wide Angle Camera colour mosaic, centred on longitude 0, 2048x1024.
 *    NASA states these images are "optimized for aesthetics, not science".
 * 2. PLACEHOLDER (default): a generated, deliberately GENERIC grey surface
 *    with random craters. It contains no maria, no named features and no
 *    real terrain. Its craters carry NO directional shading, so they cannot
 *    contradict the live Sun direction.
 *
 * Both are equirectangular, centred on longitude 0 with east to the right,
 * which is what src/sim/sphereMesh.ts expects.
 */
import * as THREE from 'three';
import { parseRawUint16LE } from '../sim/lunarElevation.ts';
import {
  TERRAIN_FILE,
  TERRAIN_RASTER_HEIGHT,
  TERRAIN_RASTER_WIDTH,
  checkElevationByteLength,
} from '../sim/terrainConfig.ts';
import type { ElevationRaster } from '../sim/lunarElevation.ts';

export interface MoonTextureInfo {
  kind: 'nasa-svs' | 'procedural';
  title: string;
  detail: string;
}

export const NASA_TEXTURE_FILE = 'textures/moon_color_16k.jpg';

export const PROCEDURAL_INFO: MoonTextureInfo = {
  kind: 'procedural',
  title: 'PLACEHOLDER SURFACE',
  detail:
    'Generated grey texture with random craters. It is NOT real lunar terrain: no maria, no named features. ' +
    'Add the NASA SVS colour map to show real imagery (see STAGE3_README).',
};

export const NASA_INFO: MoonTextureInfo = {
  kind: 'nasa-svs',
  title: 'NASA SVS CGI Moon Kit colour map',
  detail:
    "LRO Wide Angle Camera colour mosaic, 2048x1024. Credit: NASA's Scientific Visualization Studio. " +
    'Optimised for appearance, not scientific measurement. Surface relief uses NASA LRO LOLA gridded elevation data.',
};

/** Small seeded random generator so the placeholder looks the same every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createProceduralMoonTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('A 2D canvas is not available to draw the placeholder surface.');
  const rand = mulberry32(20261019);

  ctx.fillStyle = '#8c8a86';
  ctx.fillRect(0, 0, width, height);

  // Soft mottling: many faint light and dark blobs, evenly spread (no large dark regions).
  for (let i = 0; i < 2500; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 6 + rand() * 40;
    const dark = rand() < 0.5;
    ctx.fillStyle = dark ? `rgba(40,38,36,${0.03 + rand() * 0.04})` : `rgba(210,206,198,${0.03 + rand() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Random craters: uniform over the sphere, more small than large. Albedo only (no directional shading).
  const drawCrater = (cx: number, cy: number, rx: number, ry: number): void => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, 'rgba(60,58,56,0.30)');
    grad.addColorStop(0.7, 'rgba(70,68,66,0.22)');
    grad.addColorStop(0.86, 'rgba(225,222,215,0.42)');
    grad.addColorStop(1, 'rgba(225,222,215,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  for (let i = 0; i < 1800; i++) {
    const u = rand();
    const sinLat = rand() * 2 - 1; // uniform on the sphere
    const lat = Math.asin(sinLat);
    const y = (0.5 - lat / Math.PI) * height;
    const x = u * width;
    const radiusPx = 2.5 + Math.pow(rand(), 3) * 36;
    const stretch = 1 / Math.max(Math.cos(lat), 0.15); // equirectangular maps stretch east-west toward the poles
    const rx = radiusPx * stretch;
    for (const dx of [-width, 0, width]) drawCrater(x + dx, y, rx, radiusPx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Resolves to the NASA texture, or null if the file is missing or cannot be decoded. */
export function loadNasaMoonTexture(): Promise<THREE.Texture | null> {
  const url = `${import.meta.env.BASE_URL}${NASA_TEXTURE_FILE}`;
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}
/** Grayscale pixels from the optional NASA lunar height-map preview. */
export interface MoonHeightPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Loads the 8-bit preview map for visual terrain relief, not precise elevation. */
export function loadNasaMoonHeightPixels(): Promise<MoonHeightPixels | null> {
  const url = `${import.meta.env.BASE_URL}textures/moon_height_8bit.jpg`;

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext('2d');
        if (!context || canvas.width === 0 || canvas.height === 0) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );

        resolve({
          width: canvas.width,
          height: canvas.height,
          data: pixels.data,
        });
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = url;
  });
}


/** Result of loading the elevation raster: the data, or a plain-English reason it is not available. */
export type ElevationLoadResult =
  | { readonly ok: true; readonly raster: ElevationRaster }
  | { readonly ok: false; readonly reason: string };

/**
 * Loads and decodes the unsigned 16-bit little-endian LOLA elevation file ONCE.
 * Every failure (network, HTTP status, wrong size, decoding) becomes { ok: false, reason }.
 */
export async function loadNasaMoonElevation(): Promise<ElevationLoadResult> {
  const url = `${import.meta.env.BASE_URL}${TERRAIN_FILE}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, reason: `The elevation file ${url} could not be loaded (HTTP ${String(response.status)}).` };
    }
    const buffer = await response.arrayBuffer();
    const wrongSize = checkElevationByteLength(buffer.byteLength);
    if (wrongSize !== null) return { ok: false, reason: wrongSize };
    return { ok: true, raster: parseRawUint16LE(buffer, TERRAIN_RASTER_WIDTH, TERRAIN_RASTER_HEIGHT) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `The elevation file ${url} could not be read: ${detail}` };
  }
}

/** Kept for compatibility: the raster, or null if it is not available. Prefer loadNasaMoonElevation(). */
export async function loadNasaMoonElevationData(): Promise<ElevationRaster | null> {
  const result = await loadNasaMoonElevation();
  if (!result.ok) console.error('Could not load NASA lunar elevation data:', result.reason);
  return result.ok ? result.raster : null;
}
