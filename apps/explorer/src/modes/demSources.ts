/**
 * Lunar elevation datasets considered for the visualisation modes, with ONLY facts that an
 * official page states (DOCUMENTED), values calculated from them (DERIVED), or an explicit gap
 * (UNKNOWN). Pure data and functions; no downloads happen here.
 *
 * Pages read on 2026-10-24 (see `sources`). Nothing here was measured by this project.
 */

export type FactStatus = 'documented' | 'derived' | 'unknown';

export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly status: FactStatus;
}

export interface SourceLink {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly read: string;
}

export const SOURCES: Readonly<Record<string, SourceLink>> = {
  ode: {
    id: 'ode',
    title: 'ODE: LRO LOLA Gridded Data Record Shape Map (GDRDEM)',
    url: 'https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm',
    read: '2026-10-24',
  },
  lolaFaq: {
    id: 'lolaFaq',
    title: 'PDS Geosciences: LOLA FAQ',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lola_faq.htm',
    read: '2026-10-24',
  },
  pdsFaq: {
    id: 'pdsFaq',
    title: 'PDS Geosciences Node FAQ (data licensing and citation)',
    url: 'https://pds-geosciences.wustl.edu/faq.html',
    read: '2026-10-24',
  },
  pdsLola: {
    id: 'pdsLola',
    title: 'PDS Geosciences: LOLA data page (GDR and SLDEM directories)',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm',
    read: '2026-10-24',
  },
  smith2017: {
    id: 'smith2017',
    title: 'Smith et al. 2017, Summary of the results from LOLA after seven years in lunar orbit (NASA NTRS)',
    url: 'https://ntrs.nasa.gov/api/citations/20160008718/downloads/20160008718.pdf',
    read: '2026-10-24',
  },
  sldemPgda: {
    id: 'sldemPgda',
    title: 'NASA PGDA: High-resolution Lunar Topography (SLDEM2015)',
    url: 'https://pgda.gsfc.nasa.gov/products/54',
    read: '2026-10-24',
  },
  sldemUsgs: {
    id: 'sldemUsgs',
    title: 'USGS Astrogeology: LRO LOLA - SELENE Kaguya TC DEM Merge 60N60S 59m',
    url: 'https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m',
    read: '2026-10-24',
  },
};

/** The sphere all LOLA heights in these products are measured from (documented). */
export const REFERENCE_SPHERE_RADIUS_M = 1_737_400;

export type DemRole = 'global-base' | 'global-detail' | 'mid-latitude-local' | 'polar-local';

export interface DemProduct {
  readonly id: string;
  readonly name: string;
  readonly role: DemRole;
  readonly recommendation: string;
  /** Pixels per degree for an equirectangular product. */
  readonly pixelsPerDegree?: number;
  readonly facts: readonly Fact[];
  readonly sourceIds: readonly string[];
}

/** Pixel size in metres along a meridian for an equirectangular grid of `ppd` pixels per degree. */
export function pixelSizeMetres(ppd: number, radiusM: number = REFERENCE_SPHERE_RADIUS_M): number {
  if (!(ppd > 0)) throw new RangeError('Pixels per degree must be positive.');
  return (radiusM * Math.PI) / 180 / ppd;
}

/** Width x height of a global equirectangular raster at `ppd` (360 x 180 degrees). */
export function globalRasterSize(ppd: number): { width: number; height: number } {
  if (!Number.isInteger(ppd) || ppd <= 0) throw new RangeError('Pixels per degree must be a positive whole number.');
  return { width: 360 * ppd, height: 180 * ppd };
}

/** Uncompressed size in bytes of a global 16-bit raster. DERIVED, not a published file size. */
export function globalRawBytes(ppd: number): number {
  const { width, height } = globalRasterSize(ppd);
  return width * height * 2;
}

const D = (label: string, value: string): Fact => ({ label, value, status: 'documented' });
const V = (label: string, value: string): Fact => ({ label, value, status: 'derived' });
const U = (label: string, value: string): Fact => ({ label, value, status: 'unknown' });

export const DEM_PRODUCTS: readonly DemProduct[] = [
  {
    id: 'lola-ldem-16',
    name: 'LOLA LDEM_16 (global, 16 pixels per degree)',
    role: 'global-base',
    recommendation:
      'RECOMMENDED as the base for Elevation mode (Phase C): the project already loads this product (as the NASA SVS repackaging), so the colour scale, legend and picking can be verified against data already in the browser. Its coarse spacing means it must be described as regional-scale topography, not landing-site detail.',
    pixelsPerDegree: 16,
    facts: [
      D('Pixel size', '1.895 km'),
      V('Raster size', '5760 x 2880 pixels (360 x 16, 180 x 16)'),
      V('Uncompressed size', '33,177,600 bytes (16 bits per pixel)'),
      D('Projection', 'Global equirectangular, 16 bits per pixel, tiling 0-360'),
      D('Pixel meaning', 'Each pixel is the mean over its cell'),
      D('Height rule (PDS product)', 'HEIGHT = DN x SCALING_FACTOR; PLANETARY_RADIUS = DN x SCALING_FACTOR + OFFSET (formula as printed by ODE; the numeric SCALING_FACTOR and OFFSET live in each product label and were not printed on the page read)'),
      V('Height rule (NASA SVS repackaging used by this app)', '(count - 20000) / 2 metres; derived and cross-checked in docs/TERRAIN_DATA.md, not printed verbatim by NASA'),
      D('Vertical reference', 'A reference SPHERE of radius 1737.4 km, not a geoid and not "sea level"'),
      D('Accuracy', 'Individual LOLA points: precision about 10 cm, accuracy about 1 m (as quoted by the SLDEM2015 paper). The gridded product is dominated by gaps in cross-track sampling (Smith et al. 2017); count maps flag interpolated pixels.'),
      U('Accuracy of the gridded cells at 16 ppd', 'No figure found in the pages read'),
    ],
    sourceIds: ['ode', 'lolaFaq', 'smith2017', 'sldemPgda'],
  },
  {
    id: 'lola-ldem-64',
    name: 'LOLA LDEM_64 (global, 64 pixels per degree)',
    role: 'global-detail',
    recommendation:
      'OPTIONAL later: better global detail, but about 531 MB uncompressed, too large to load raw in a browser. It would need to be pre-processed into a tiled or down-sampled pyramid at build time. Not needed for the first Elevation mode.',
    pixelsPerDegree: 64,
    facts: [
      D('Pixel size', '0.4738 km'),
      V('Raster size', '23040 x 11520 pixels'),
      V('Uncompressed size', '530,841,600 bytes (16 bits per pixel)'),
      D('Formats listed', '.IMG, _FLOAT.IMG, .JP2 with detached labels'),
      U('Published file sizes', 'Not stated on the pages read'),
    ],
    sourceIds: ['ode', 'pdsLola'],
  },
  {
    id: 'sldem2015',
    name: 'SLDEM2015 (LOLA + SELENE Terrain Camera merge, 512 ppd, latitudes -60 to +60)',
    role: 'mid-latitude-local',
    recommendation:
      'BEST candidate for landing-site analysis between 60 S and 60 N (59 m pixels, typical vertical accuracy 3 to 4 m). Global 512 ppd is about 22 GB, so only small regional tiles could ever be fetched. Does not cover the poles.',
    pixelsPerDegree: 512,
    facts: [
      D('Pixel size', 'about 59 m at the equator (59.2252938 m per pixel)'),
      D('Coverage', 'Latitude -60 to 60, longitude -180 to 180'),
      D('Raster (USGS global GeoTIFF)', '61,440 rows x 184,320 columns, 16-bit'),
      D('File size (USGS global GeoTIFF)', '22 GB'),
      D('Projection', 'Equirectangular, planetocentric latitude, positive-east longitude'),
      D('Vertical reference', 'Referred to a radius of 1,737,400 m, units metres'),
      D('Typical vertical accuracy', '3 to 4 m'),
      D('Tiles', '512 and 256 ppd tiles in FLOAT IMG and JP2'),
      D('Licence', 'USGS: "public domain"; "Please cite authors"; credit NASA LOLA Team and JAXA SELENE/Kaguya Team'),
      U('Nodata value / checksum', 'Not stated on the USGS page'),
    ],
    sourceIds: ['sldemUsgs', 'sldemPgda'],
  },
  {
    id: 'lola-polar',
    name: 'LOLA polar stereographic grids (LDEM_45S_100M ... LDEM_87S_5M, north and south)',
    role: 'polar-local',
    recommendation:
      'Required for south-polar CLPS targets (poleward of 60 degrees), where equirectangular grids distort badly. Pixel sizes 100 m down to 5 m. These are separate stereographic rasters, so they need their own projection code (Phase D/E), not the globe grid.',
    facts: [
      D('LDEM_45S_100M', '28880 x 28800 px, 100 m, from 45 degrees to the pole'),
      D('LDEM_60S_60M', '31040 x 31040 px, 60 m, from 60 degrees to the pole'),
      D('LDEM_75S_30M', '30496 x 30496 px, 30 m, from 75 degrees to the pole'),
      D('LDEM_80S_20M', '30400 x 30400 px, 20 m, from 80 degrees to the pole'),
      D('LDEM_85S_10M', '30336 x 30336 px, 10 m, from 85 degrees to the pole'),
      D('LDEM_87S_5M', '30336 x 30336 px, 5 m, from 87.5 degrees to the pole'),
      D('Pixel scale', 'Integral metres at radius 1,737,400 m, true at the pole; the pole lies between the four central pixels'),
      D('Known limit', 'Smith et al. 2017: interpolation in this projection "does not perform well in preserving shapes of landforms near the poles"'),
      V('Uncompressed size of one 10 m grid', 'about 1.8 GB (30336 x 30336 x 2 bytes), too large for a browser without tiling'),
      U('Published file sizes', 'Not stated on the pages read'),
    ],
    sourceIds: ['ode', 'smith2017'],
  },
];

export const DATUM_STATEMENT =
  'Heights are metres above a reference sphere of radius 1737.4 km (the IAU lunar sphere). They are not elevations above a geoid or "sea level".';

export const LICENCE_STATEMENT =
  'Data archived in the NASA PDS are in the public domain and should be cited like published research (PDS Geosciences Node FAQ). SLDEM2015 (USGS): public domain, please cite authors and credit the NASA LOLA Team and the JAXA SELENE/Kaguya Team.';

export function demProduct(id: string): DemProduct | undefined {
  return DEM_PRODUCTS.find((p) => p.id === id);
}
