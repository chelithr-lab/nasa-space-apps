/**
 * Landmarks used to check the elevation raster's orientation, with the evidence behind each one.
 * Every value below was READ from the cited page on 2026-10-29/31. Nothing is estimated or recalled.
 *
 * Longitude is degrees EAST, -180..180 (the lunar convention used by this app and by the
 * USGS Gazetteer entries below). Latitude is degrees north.
 *
 * VERIFICATION TIERS
 *   'gazetteer' : the coordinates are on a USGS Gazetteer of Planetary Nomenclature page.
 *   'secondary' : the coordinates come from a secondary source (Wikipedia infobox, a LROC post).
 *                 They are plausible and consistent, but NOT confirmed against the Gazetteer here,
 *                 because the Gazetteer pages for Tycho and Copernicus could not be fetched.
 */
export type LandmarkTier = 'gazetteer' | 'secondary';

export interface CraterLandmark {
  readonly id: string;
  readonly name: string;
  readonly latDeg: number;
  /** Degrees east, -180..180. */
  readonly lonDeg: number;
  readonly diameterKm: number;
  readonly tier: LandmarkTier;
  readonly source: string;
  readonly note: string;
}

export interface ExtremumLandmark {
  readonly id: 'highest' | 'lowest';
  readonly name: string;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Accepted disagreement between sources, in degrees of arc (about 30 km). */
  readonly toleranceDeg: number;
  readonly tier: LandmarkTier;
  readonly source: string;
  readonly note: string;
}

export const CRATER_LANDMARKS: readonly CraterLandmark[] = [
  {
    id: 'tsiolkovskiy',
    name: 'Tsiolkovskiy',
    latDeg: -20.38,
    lonDeg: 128.97,
    diameterKm: 184.39,
    tier: 'gazetteer',
    source: 'https://planetarynames.wr.usgs.gov/Feature/6108',
    note: 'Gazetteer: centre -20.38, 128.97 (+East, -180..180), 184.39 km (another geometry lists -20.46, 129.06, 185.00 km). Far side, eastern hemisphere.',
  },
  {
    id: 'tycho',
    name: 'Tycho',
    latDeg: -43.31,
    lonDeg: -11.36,
    diameterKm: 85,
    tier: 'secondary',
    source: 'https://en.wikipedia.org/wiki/Tycho_(lunar_crater)',
    note: 'Wikipedia infobox 43.31 S, 11.36 W, about 85 km, no cited source. Gazetteer page not retrieved. Near side, southern highlands.',
  },
  {
    id: 'copernicus',
    name: 'Copernicus',
    latDeg: 9.62,
    lonDeg: -20.08,
    diameterKm: 93,
    tier: 'secondary',
    source: 'https://en.wikipedia.org/wiki/Copernicus_(lunar_crater)',
    note: 'Wikipedia infobox 9.62 N, 20.08 W, about 93 km, no cited source. Gazetteer page not retrieved. Near side, western hemisphere.',
  },
];

export const EXTREMUM_LANDMARKS: readonly ExtremumLandmark[] = [
  {
    id: 'highest',
    name: 'Highest point on the Moon',
    latDeg: 5.4125,
    lonDeg: -158.6335,
    toleranceDeg: 1,
    tier: 'secondary',
    source: 'https://lunarnetworks.blogspot.com/2010/10/lroc-highest-point-on-moon.html?m=1',
    note: 'LROC post quoting 10,786 m, 5.4125 N, 201.3665 E (= 158.6335 W). Measured on a high-resolution LROC/LOLA product; the 16 pixel-per-degree cell mean will be lower.',
  },
  {
    id: 'lowest',
    name: 'Lowest point on the Moon (inside Antoniadi)',
    latDeg: -70.368,
    lonDeg: -172.413,
    toleranceDeg: 1,
    tier: 'secondary',
    source: 'https://en.wikipedia.org/wiki/Antoniadi_(lunar_crater)',
    note: 'Wikipedia: Chang’e-1 refinement 70.368 S, 172.413 W; Kaguya LALT 70.43 S, 187.42 E (= 172.58 W). Sources agree to about 0.2 degrees.',
  },
];

/** What cannot be checked with these landmarks. Shown in the report so it is never missing. */
export const ORIENTATION_LIMITS: readonly string[] = [
  'Matching extreme points is evidence, not proof: it tests two points, and a mirrored raster with a coincidentally symmetric pair would pass.',
  'Crater floor-versus-rim contrast can be imitated by other craters, basins or noise; the check ranks the published position against the same latitude, so a strong neighbour could still outrank it.',
  'The thresholds in orientationCheck.ts have been exercised on synthetic rasters only. They have not yet been run on the real LDEM_16 data.',
  'Shackleton (about 89.7 S) cannot test east-west orientation, because longitude is almost undefined at the pole, and is not used as a pass/fail landmark.',
  'No page read states the SVS raster’s row order or its east direction. SVS says only that the elevation and colour maps are "centered on 0 degrees longitude".',
  'The colour texture’s orientation is NOT tested by these checks. It must be compared on screen with the coordinate readout (see docs/ORIENTATION_VERIFICATION.md).',
];
