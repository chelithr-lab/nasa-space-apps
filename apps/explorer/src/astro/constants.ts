/**
 * Physical constants and range markers used by the astronomy module.
 * Every value names its source. No value here is a measurement of the Moon's
 * terrain or of any mission site.
 */

/** Kilometres per astronomical unit. IAU 2012 Resolution B2 (exact by definition). */
export const KM_PER_AU = 149597870.7;

/**
 * Radius of the reference sphere for lunar elevation (LOLA) used by the
 * NASA SVS CGI Moon Kit: 1737.4 km (https://svs.gsfc.nasa.gov/4720).
 * Used here only to estimate the Moon's angular size from distance.
 */
export const MOON_REFERENCE_RADIUS_KM = 1737.4;

/**
 * Mean obliquity of the ecliptic at J2000.0 in arcseconds (IAU 1976 value,
 * 23 deg 26' 21.448"). Used ONLY to define the fixed J2000 ecliptic frame for
 * the Sun-Moon elongation. The IAU 2006 value differs by 0.042", which is
 * far below anything this application can show.
 */
export const MEAN_OBLIQUITY_J2000_ARCSEC = 84381.448;

/**
 * Span covered by the reference spot checks in docs/ASTRO_VALIDATION.md
 * (lunar phase times at the years 1901, 1950, 2001, 2026, 2050, 2099).
 * This is NOT a claim that accuracy is demonstrated continuously across the
 * span. Outside the span the state carries an explicit warning.
 */
export const REFERENCE_SPAN = {
  startMs: Date.UTC(1901, 0, 1, 0, 0, 0),
  endMs: Date.UTC(2099, 11, 31, 23, 59, 59),
} as const;

export const REFERENCE_CHECK_YEARS = [1901, 1950, 2001, 2026, 2050, 2099] as const;
