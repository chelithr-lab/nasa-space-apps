/**
 * Which Moon-fixed orientation the app uses, chosen once at start-up.
 *
 *   default                       'iau'          the IAU rotational-elements series
 *   ?frame=approximate            'approximate'  the original simplified frame (zero libration)
 *
 * The switch exists so the change of orientation can be compared and undone. Site-level solar
 * results (Lunar Solar Intelligence) are only reliable with 'iau'; the interface warns when
 * 'approximate' is in use.
 */
import type { FrameModelId } from './simSnapshot.ts';

export function frameModelFromSearch(search: string): FrameModelId {
  const m = /[?&]frame=([^&#]*)/.exec(search);
  return m !== null && m[1] === 'approximate' ? 'approximate' : 'iau';
}

/** The model in use for this page load (read from the address bar once). */
export function currentFrameModel(): FrameModelId {
  return frameModelFromSearch(typeof location !== 'undefined' ? location.search : '');
}

export function frameChip(model: FrameModelId): { label: string; title: string; warn: boolean } {
  return model === 'iau'
    ? {
        label: 'Orientation: IAU series',
        title:
          'The Moon-fixed frame uses the IAU rotational elements (libration and pole direction included). Not included: the ~0.02 degree Mean-Earth/Principal-Axis offset, and the real orientation of the texture and height raster is still being verified (see docs/ORIENTATION_VERIFICATION.md).',
        warn: false,
      }
    : {
        label: 'Orientation: APPROXIMATE',
        title:
          'The Moon-fixed orientation is the original simplification: it ignores libration (up to about 8 degrees of longitude) and the 1.5 degree axis tilt. Remove ?frame=approximate from the address for the IAU orientation.',
        warn: true,
      };
}
