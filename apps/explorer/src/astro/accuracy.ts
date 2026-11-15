/**
 * The five accuracy levels required by the project brief. Every group of
 * quantities in AstroState carries one of these so the interface never
 * implies that everything has the same accuracy.
 */
export type AccuracyLevel = 1 | 2 | 3 | 4 | 5;

export const ACCURACY_LEVEL_NAMES: Record<AccuracyLevel, string> = {
  1: 'Source-provided or observed data',
  2: 'Ephemeris-based calculated geometry',
  3: 'Terrain-based illumination or shadow calculation',
  4: 'Simplified approximation',
  5: 'Hypothetical user-created scenario',
};

export interface AccuracyNote {
  level: AccuracyLevel;
  levelName: string;
  note: string;
}

function note(level: AccuracyLevel, text: string): AccuracyNote {
  return { level, levelName: ACCURACY_LEVEL_NAMES[level], note: text };
}

/**
 * Honest labels for what this module computes. Level 3 (terrain shadows)
 * and level 1 (observed/source data) do not occur in the astronomy module.
 * All values for future dates are predictions from the model, not observations.
 */
export const ACCURACY = {
  positions: note(
    2,
    'Geocentric Moon and Sun vectors from Astronomy Engine. Its README states a design goal of within 1 arcminute of NOVAS; ' +
      'this project spot-checks that (see docs/ASTRO_VALIDATION.md) but has not measured it continuously. ' +
      'Moon: geometric position. Sun: light-time corrected, aberration NOT applied (effect up to about 0.006 degrees).',
  ),
  phase: note(
    2,
    'Derived from the same Earth, Moon and Sun vectors as the positions (Moon and Sun treated as points; no terrain, no libration effects).',
  ),
  libration: note(
    4,
    'Optical libration angles as returned by Astronomy Engine. The library does not document the sign convention or whether ' +
      'physical libration is included, so these values are treated as UNVERIFIED for rendering until checked in the lunar-surface stage.',
  ),
  earthRotation: note(
    4,
    'Greenwich Apparent Sidereal Time plus precession/nutation from Astronomy Engine. UT1 is approximated by UTC (difference under 0.9 s), ' +
      'polar motion is ignored, and sub-points use geocentric (not geodetic) latitude.',
  ),
} as const;
