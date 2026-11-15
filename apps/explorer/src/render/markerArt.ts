import { MARKER_COLOURS } from '../sim/missionMarker.ts';
import type { MarkerKind } from '../sim/missionMarker.ts';

/**
 * The mission-marker picture: a reticle (ring, four ticks, centre diamond). Every shape is drawn
 * twice, a wide dark stroke and then a narrower bright stroke on top, so the marker reads on bright
 * highlands and on dark maria. No Three.js here, so it can be previewed on any canvas.
 */
export const MARKER_TEXTURE_PIXELS = 128;

export function drawMissionMarker(ctx: CanvasRenderingContext2D, kind: MarkerKind): void {
  const { accent, outline } = MARKER_COLOURS[kind];
  const c = MARKER_TEXTURE_PIXELS / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ring = (r: number): void => {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
  };
  ctx.strokeStyle = outline;
  ctx.lineWidth = 13;
  ring(33);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ring(33);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const x0 = c + Math.cos(a) * 41;
    const y0 = c + Math.sin(a) * 41;
    const x1 = c + Math.cos(a) * 58;
    const y1 = c + Math.sin(a) * 58;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  const diamond = (r: number): void => {
    ctx.beginPath();
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r, c);
    ctx.closePath();
  };
  diamond(17);
  ctx.fillStyle = outline;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6;
  ctx.stroke();
  diamond(12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
