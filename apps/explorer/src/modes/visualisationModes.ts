/**
 * The six visualisation modes: their identity, honest implementation status, and what each
 * one still needs. Pure data and functions (no React, no Three.js).
 *
 * STATUS RULES
 *  - Only 'available' means the mode does what its name says. At this stage that is Normal, Elevation and Illumination
 *    (Illumination = calculated analysis of ONE clicked site; there is no whole-Moon shadow map).
 *  - 'awaiting-implementation': the data source is identified but the code is not written.
 *  - 'awaiting-data': a dataset or validated criteria are still missing, not only code.
 *  - A mode that is not 'available' never shows a number, a colour scale or a score.
 *
 * Switching mode changes ONLY which analysis layer is shown. It does not own, reset or copy the
 * camera, the simulation clock or the selected mission (see modeStore.ts).
 */

export type ModeId = 'normal' | 'elevation' | 'slope' | 'relief' | 'illumination' | 'safety';

export type ModeStatus = 'available' | 'awaiting-implementation' | 'awaiting-data';

export const MODE_STATUS_LABEL: Readonly<Record<ModeStatus, string>> = {
  available: 'Available',
  'awaiting-implementation': 'Awaiting implementation',
  'awaiting-data': 'Awaiting data',
};

export interface ModeDescriptor {
  readonly id: ModeId;
  readonly label: string;
  readonly status: ModeStatus;
  /** What the mode is for, in one sentence. */
  readonly purpose: string;
  /** What the user sees while the mode is not available. Empty for an available mode. */
  readonly notice: string;
  /** What this mode will calculate or show once it exists. */
  readonly plannedContent: readonly string[];
  /** What is still missing before it can be switched on. */
  readonly needs: readonly string[];
  /** Roadmap phase (see docs/MODES_AND_DEM.md). */
  readonly phase: 'B' | 'C' | 'D' | 'E' | 'F';
}

export const MODE_ORDER: readonly ModeId[] = ['normal', 'elevation', 'slope', 'relief', 'illumination', 'safety'];

export const DEFAULT_MODE: ModeId = 'normal';

const NOT_IMPLEMENTED = 'The Moon is shown in its Normal appearance. No values for this mode are calculated or shown yet.';

export const MODES: Readonly<Record<ModeId, ModeDescriptor>> = {
  normal: {
    id: 'normal',
    label: 'Normal',
    status: 'available',
    purpose: 'The photographic Moon with its mission waypoints, as the application has always shown it.',
    notice: '',
    plannedContent: [],
    needs: [],
    phase: 'B',
  },
  elevation: {
    id: 'elevation',
    label: 'Elevation',
    status: 'available',
    purpose:
      'Colour the surface by the height of the NASA LRO LOLA LDEM_16 data above the 1737.4 km reference sphere, with a numeric legend. Colours show height only, not imagery or lighting.',
    notice: '',
    plannedContent: [],
    needs: [],
    phase: 'C',
  },
  slope: {
    id: 'slope',
    label: 'Slope',
    status: 'awaiting-implementation',
    purpose: 'Show how steep the surface is, in degrees, calculated from the elevation data.',
    notice: NOT_IMPLEMENTED,
    plannedContent: [
      'Slope in degrees, with the grid spacing it was calculated over stated beside it',
      'A numeric legend and a read-out at a chosen point',
    ],
    needs: [
      'Elevation mode first (shared data loading and picking)',
      'A decision on which resolution to use, because slope depends on the distance it is measured over',
      'Lander-specific slope limits, only when verified ones are supplied',
    ],
    phase: 'D',
  },
  relief: {
    id: 'relief',
    label: 'Terrain relief',
    status: 'awaiting-implementation',
    purpose: 'Shaded relief from the elevation data to make craters, ridges and basin walls readable.',
    notice: NOT_IMPLEMENTED,
    plannedContent: [
      'Analytical shaded relief with an adjustable light direction, labelled as NOT real sunlight',
    ],
    needs: ['Elevation mode first (shared data loading)', 'Shading calculation code and tests'],
    phase: 'D',
  },
  illumination: {
    id: 'illumination',
    label: 'Illumination',
    status: 'available',
    purpose:
      'Click a point on the Moon for a calculated solar analysis of that exact site: Sun elevation and azimuth, terrain horizon, sunrise and sunset, solar power. The globe itself is drawn as in Normal mode (its lighting is a display aid).',
    notice: '',
    plannedContent: [],
    needs: [
      'Still NOT provided: a whole-Moon terrain-shadow map (a DEM fine enough for the area being studied is needed)',
      'Still NOT provided: permanently shadowed regions. They need a published, verified dataset (not yet chosen); a single lighting calculation can never label a region permanently shadowed',
    ],
    phase: 'E',
  },
  safety: {
    id: 'safety',
    label: 'Landing safety',
    status: 'awaiting-data',
    purpose: 'An educational read-out of the measurements around a site. It is not a safety verdict.',
    notice: NOT_IMPLEMENTED,
    plannedContent: [
      'Elevation, slope and illumination measurements at a site, each with its source and uncertainty',
      'No single score, and no claim that a place is safe',
    ],
    needs: [
      'Verified lander requirements (to be supplied with the mission list)',
      'Slope and illumination modes',
      'Hazard data at a scale where hazards can be seen',
    ],
    phase: 'F',
  },
};

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && (MODE_ORDER as readonly string[]).includes(value);
}

export function modeDescriptor(id: ModeId): ModeDescriptor {
  return MODES[id];
}

/** True only when the mode really does what its name says. */
export function isModeAvailable(id: ModeId): boolean {
  return MODES[id].status === 'available';
}

/** The text the interface shows for a mode: never a value, only status and wording. */
export interface ModeView {
  readonly id: ModeId;
  readonly label: string;
  readonly status: ModeStatus;
  readonly statusLabel: string;
  readonly available: boolean;
  /** Short line shown while the mode is active; empty for Normal. */
  readonly notice: string;
  /** Chip text for the Moon view, or undefined when nothing needs flagging. */
  readonly chip: string | undefined;
}

export function modeView(id: ModeId): ModeView {
  const m = MODES[id];
  return {
    id,
    label: m.label,
    status: m.status,
    statusLabel: MODE_STATUS_LABEL[m.status],
    available: m.status === 'available',
    notice: m.notice,
    chip: m.status === 'available' ? undefined : `${m.label} mode not implemented: showing Normal view`,
  };
}
