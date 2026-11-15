/**
 * Mission catalogue (batch 1): typed, sourced records of lunar surface missions.
 *
 * Pure data and pure functions (no Three.js, no React), so it can be tested in Node.
 *
 * RULES
 *  1. Every fact came from a page that was opened and read; each record lists its sources.
 *     `verified` is the date the pages were read, not the date of the event.
 *  2. Coordinates: latitude north-positive, longitude east-positive (the project convention).
 *     A coordinate is stored ONLY if a source printed it. Nothing is inferred from a region name.
 *  3. The types stop a failed attempt or a plan from carrying a surface point:
 *     only `LandedMission` may have `kind: 'surface-point'`.
 *  4. Missing optional fields mean "not established in the sources used", never "none".
 */

export type CoordinateFrameNote = string;

export interface SourceRef {
  readonly title: string;
  readonly url: string;
  /** Date (YYYY-MM-DD) these pages were read for this record. */
  readonly verified: string;
}

export interface Coordinate {
  /** North-positive degrees. */
  readonly latDeg: number;
  /** East-positive degrees, -180..180. */
  readonly lonDeg: number;
  /** Which source printed it, how it was derived and its frame, as stated. */
  readonly note: CoordinateFrameNote;
  /** Stated uncertainty, only if a source gave one. */
  readonly uncertainty?: string;
}

/** Where on the surface a mission is. Only a printed coordinate becomes a 'surface-point'. */
export type SurfaceLocation =
  | { readonly kind: 'surface-point'; readonly regionName: string; readonly coordinate: Coordinate }
  | { readonly kind: 'region-only'; readonly regionName: string; readonly note: string }
  | { readonly kind: 'none'; readonly note: string };

/** How far a payload is known to have got. Highest stage the sources support. */
export type PayloadStage = 'planned' | 'delivered' | 'activated' | 'operated';

export interface Payload {
  readonly id: string;
  readonly name: string;
  readonly provider?: string;
  readonly purpose: string;
  /** The scientific or engineering objective, only when a source states it separately from the purpose. */
  readonly objective?: string;
  readonly stage: PayloadStage;
  /**
   * How much of the objective a source says was achieved, for a payload that operated.
   * Absent = the sources used do not say.
   */
  readonly achievement?: 'full' | 'partial' | 'not-achieved';
  /** Result as the source states it. Absent = no result reported in the sources used. */
  readonly result?: string;
  readonly passive?: boolean;
}

export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD) or ISO date-time with offset. */
  readonly when: string;
  readonly event: string;
  /** Timezone/precision remark, e.g. "time zone as printed by NASA". */
  readonly note?: string;
}

export interface SurfaceFeature {
  readonly name: string;
  readonly kind: 'lander' | 'science-station' | 'retroreflector';
  readonly coordinate: Coordinate;
}

interface MissionBase {
  /** Stable, lower-case, never reused. */
  readonly id: string;
  readonly name: string;
  readonly category: 'crewed-landing' | 'commercial-delivery';
  readonly agency: string;
  readonly country: string;
  readonly operator: string;
  readonly spacecraft?: string;
  readonly launchDate?: string;
  readonly summary: string;
  readonly objectives: readonly string[];
  readonly payloads: readonly Payload[];
  readonly timeline: readonly TimelineEvent[];
  readonly achievements: readonly string[];
  readonly limitations: readonly string[];
  /** Facts the sources left open that a reader might assume. */
  readonly unverified: readonly string[];
  readonly features?: readonly SurfaceFeature[];
  readonly sources: readonly SourceRef[];
}

/** A spacecraft that reached the surface. */
export interface LandedMission extends MissionBase {
  readonly outcome: 'success' | 'partial';
  readonly landingDate: string;
  readonly location: SurfaceLocation;
}

/** An attempt that never reached the surface. It can NEVER carry a surface point. */
export interface FailedMission extends MissionBase {
  readonly outcome: 'failed-no-landing';
  readonly location: { readonly kind: 'none'; readonly note: string };
}

/** Announced but not flown. Never a surface point. (No planned records in batch 1.) */
export interface PlannedMission extends MissionBase {
  readonly outcome: 'planned';
  readonly location: { readonly kind: 'region-only'; readonly regionName: string; readonly note: string } | { readonly kind: 'none'; readonly note: string };
}

export type Mission = LandedMission | FailedMission | PlannedMission;

export const OUTCOME_LABEL: Readonly<Record<Mission['outcome'], string>> = {
  success: 'Successful landing',
  partial: 'Landed, partial success',
  'failed-no-landing': 'Did not land (failed attempt)',
  planned: 'Planned (has not happened)',
};

export const STAGE_LABEL: Readonly<Record<PayloadStage, string>> = {
  planned: 'Planned only',
  delivered: 'Delivered to the surface',
  activated: 'Activated',
  operated: 'Operated and returned data',
};

// ---- sources -------------------------------------------------------------------------

const VERIFIED = '2026-10-24';
const src = (title: string, url: string): SourceRef => ({ title, url, verified: VERIFIED });

const NSSDC_COORDS = src('NASA NSSDC: Apollo Landing Site Coordinates', 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html');
const NSSDC_LANDINGS = src('NASA NSSDC: Apollo Lunar Landings (1969 - 1972)', 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apolloland.html');

const APOLLO_COORD_NOTE =
  'NASA NSSDC table "Apollo Landing Site Coordinates": planetocentric, Mean Earth/Polar Axis frame with DE421, ' +
  'determined from Lunar Reconnaissance Orbiter images (Wagner et al., Icarus 283, 92-103, 2017). No accuracy figure is printed on the page.';

const coord = (latDeg: number, lonDeg: number): Coordinate => ({ latDeg, lonDeg, note: APOLLO_COORD_NOTE });

interface ApolloInput {
  id: string;
  name: string;
  date: string;
  site: string;
  lm: [number, number];
  alsep?: [number, number];
  lrrr?: [number, number];
  evaHours: number;
  sampleKg: number;
}

function apollo(a: ApolloInput): LandedMission {
  const features: SurfaceFeature[] = [{ name: 'Lunar Module', kind: 'lander', coordinate: coord(a.lm[0], a.lm[1]) }];
  if (a.alsep) features.push({ name: 'ALSEP', kind: 'science-station', coordinate: coord(a.alsep[0], a.alsep[1]) });
  if (a.lrrr) features.push({ name: 'LRRR', kind: 'retroreflector', coordinate: coord(a.lrrr[0], a.lrrr[1]) });
  return {
    id: a.id,
    name: a.name,
    category: 'crewed-landing',
    agency: 'NASA',
    country: 'United States',
    operator: 'NASA',
    outcome: 'success',
    landingDate: a.date,
    summary: `${a.name} landed astronauts at ${a.site} on the Moon. Location and landing date are from the NASA NSSDC Apollo landing tables.`,
    objectives: [],
    payloads: [],
    timeline: [{ when: a.date, event: 'Landing', note: 'Date as listed by NSSDC (UTC); time of day not listed there.' }],
    achievements: [
      `Total EVA time listed by NSSDC: ${a.evaHours} hours.`,
      `Samples returned listed by NSSDC: ${a.sampleKg} kg.`,
    ],
    limitations: [],
    unverified: [
      'Launch date, crew, spacecraft names, mission objectives and instrument lists are not yet in this record (next batch).',
      'The NSSDC page prints no accuracy figure for the coordinates.',
    ],
    location: {
      kind: 'surface-point',
      regionName: a.site,
      coordinate: coord(a.lm[0], a.lm[1]),
    },
    features,
    sources: [NSSDC_COORDS, NSSDC_LANDINGS],
  };
}

// ---- Apollo --------------------------------------------------------------------------

const APOLLO: readonly LandedMission[] = [
  apollo({ id: 'apollo-11', name: 'Apollo 11', date: '1969-07-20', site: 'Mare Tranquillitatis', lm: [0.67416, 23.47314], lrrr: [0.67345, 23.47307], evaHours: 2.53, sampleKg: 21.55 }),
  apollo({ id: 'apollo-12', name: 'Apollo 12', date: '1969-11-19', site: 'Oceanus Procellarum', lm: [-3.0128, -23.4219], alsep: [-3.0098, -23.4249], evaHours: 7.75, sampleKg: 34.35 }),
  apollo({ id: 'apollo-14', name: 'Apollo 14', date: '1971-02-05', site: 'Fra Mauro', lm: [-3.64589, -17.47194], alsep: [-3.64419, -17.47768], lrrr: [-3.64417, -17.47865], evaHours: 9.38, sampleKg: 42.28 }),
  apollo({ id: 'apollo-15', name: 'Apollo 15', date: '1971-07-30', site: 'Hadley Rille', lm: [26.13239, 3.6333], alsep: [26.13406, 3.62991], lrrr: [26.13341, 3.6285], evaHours: 19.13, sampleKg: 77.31 }),
  apollo({ id: 'apollo-16', name: 'Apollo 16', date: '1972-04-20', site: 'Descartes', lm: [-8.9734, 15.5011], alsep: [-8.9759, 15.4986], evaHours: 20.23, sampleKg: 95.71 }),
  apollo({ id: 'apollo-17', name: 'Apollo 17', date: '1972-12-11', site: 'Taurus-Littrow', lm: [20.1911, 30.7723], alsep: [20.1923, 30.7655], evaHours: 22.07, sampleKg: 110.52 }),
];

// ---- CLPS ----------------------------------------------------------------------------

const IM1_SRC = src('NASA: LRO Images Intuitive Machines Odysseus Lander', 'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/');
const IM1_SCIENCE = src(
  'NASA: NASA Collects First Surface Science in Decades via Commercial Moon Mission',
  'https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/',
);

const IM1: LandedMission = {
  id: 'im-1',
  name: 'Intuitive Machines IM-1',
  category: 'commercial-delivery',
  agency: 'NASA (CLPS customer)',
  country: 'United States',
  operator: 'Intuitive Machines',
  spacecraft: 'Odysseus',
  outcome: 'partial',
  landingDate: '2024-02-22',
  summary:
    'Odysseus was the first successful soft landing of NASA\'s CLPS initiative. It came to rest near crater Malapert A in the south polar region, leaning into the surface, which limited communications and data collection.',
  objectives: ['Deliver NASA science and technology payloads to the south polar region of the Moon.'],
  payloads: [
    { id: 'im-1-rfmg', name: 'Radio Frequency Mass Gauge', purpose: 'Instrument listed by NASA among the IM-1 payloads.', stage: 'operated', result: 'Collected data during powered descent and landing (NASA).' },
    { id: 'im-1-ndl', name: 'Navigation Doppler Lidar', purpose: 'Navigation technology demonstration listed by NASA.', stage: 'operated', result: 'Collected data during powered descent and landing (NASA).' },
    { id: 'im-1-rolses', name: 'Radio-wave Observations at the Lunar Surface of the Photoelectron Sheath (ROLSES)', purpose: 'Instrument listed by NASA among the IM-1 payloads.', stage: 'operated', result: 'Powered on, performed surface operations and returned data (NASA lists it together with Lunar Node-1).' },
    { id: 'im-1-ln1', name: 'Lunar Node-1', purpose: 'Instrument listed by NASA among the IM-1 payloads.', stage: 'operated', result: 'Powered on, performed surface operations and returned data (NASA lists it together with ROLSES).' },
    { id: 'im-1-scalpss', name: 'Stereo Cameras for Lunar Plume-Surface Studies (SCALPSS)', purpose: 'Image how the landing engine plume interacts with the surface.', stage: 'operated', achievement: 'partial', result: 'Powered on and imaged during transit and several days after landing; it was not successfully commanded to image the plume-surface interaction during landing (NASA).' },
    { id: 'im-1-lra', name: 'Laser Retroreflector Array', provider: 'NASA', purpose: 'Passive target for laser ranging from orbit.', stage: 'delivered', passive: true, result: 'Passive. NASA says initial estimates suggest it can be laser-ranged from LRO\'s laser altimeter as a permanent location marker.' },
  ],
  timeline: [
    { when: '2024-02-22T18:24:00-05:00', event: 'Landing', note: '6:24 p.m. EST as printed by NASA.' },
    { when: '2024-02-24T13:57:00-05:00', event: 'LRO photographed Odysseus', note: '1:57 p.m. EST as printed by NASA; LRO at about 90 km altitude.' },
  ],
  achievements: ['First successful soft landing of NASA\'s CLPS initiative (NASA).', 'NASA quotes: every NASA instrument has met some level of its objectives.'],
  limitations: [
    'Odysseus came to rest in a degraded crater about 1 km across, on terrain sloped at 12 degrees (NASA), gently leaning into the surface.',
    'Payload data collection was limited by communications and other constraints from the lander orientation (NASA).',
    'NASA says instruments ceased science operations seven days after landing.',
  ],
  unverified: [
    'The NASA page does not name a coordinate reference frame or say how the coordinates were determined.',
    'Launch date is not in this record yet.',
    'The exact tilt angle and the end-of-operations date are not stated by the pages used.',
  ],
  location: {
    kind: 'surface-point',
    regionName: 'Near crater Malapert A, south polar region',
    coordinate: {
      latDeg: -80.13,
      lonDeg: 1.44,
      note: 'Printed by NASA as "80.13 degrees south latitude, 1.44 degrees east longitude", elevation 8,461 ft (2,579 m). No frame or method stated; LROC image M1463440322L.',
    },
  },
  sources: [IM1_SRC, IM1_SCIENCE],
};

const BG1_SOURCES: readonly SourceRef[] = [
  src('NASA: Blue Ghost lands on Moon', 'https://www.nasa.gov/image-article/blue-ghost-lands-on-moon/'),
  src('NASA: NASA Science Continues After Firefly\'s First Moon Mission Concludes', 'https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/'),
  src('NASA: Firefly Blue Ghost Mission One press kit (payload list)', 'https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf'),
  src('Firefly Aerospace: 14 Days of Surface Operations', 'https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon/'),
];

const BG1: LandedMission = {
  id: 'blue-ghost-1',
  name: 'Firefly Blue Ghost Mission 1',
  category: 'commercial-delivery',
  agency: 'NASA (CLPS customer)',
  country: 'United States',
  operator: 'Firefly Aerospace',
  spacecraft: 'Blue Ghost',
  outcome: 'success',
  landingDate: '2025-03-02',
  summary:
    'Blue Ghost landed near the volcanic feature Mons Latreille in Mare Crisium and operated for about 14 days plus several hours into the lunar night. NASA lists all 10 of its payloads as having produced results.',
  objectives: ['Deliver 10 NASA CLPS science and technology payloads to Mare Crisium.'],
  payloads: [
    { id: 'bg1-lister', name: 'Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity (LISTER)', provider: 'Texas Tech University', purpose: 'Measure heat flow from the Moon\'s interior with a drilling probe.', stage: 'operated', result: 'NASA: drilled up to about 3 feet and took thermal measurements at several depths; called the deepest robotic planetary subsurface thermal probe.' },
    { id: 'bg1-lpv', name: 'Lunar PlanetVac (LPV)', provider: 'Honeybee Robotics', purpose: 'Collect regolith using gas bursts.', stage: 'operated', result: 'NASA: collected, transferred and sorted lunar soil with pressurized nitrogen gas.' },
    { id: 'bg1-nglr', name: 'Next Generation Lunar Retroreflector (NGLR)', provider: 'University of Maryland', purpose: 'Laser-ranging target to measure Earth-Moon distance.', stage: 'operated', result: 'NASA: reflected laser light from two Lunar Laser Ranging Observatories.' },
    { id: 'bg1-rac', name: 'Regolith Adherence Characterization (RAC)', provider: 'Aegis Aerospace', purpose: 'Measure how lunar dust sticks to different materials.', stage: 'operated', result: 'NASA: examined how regolith sticks to a range of materials.' },
    { id: 'bg1-radpc', name: 'Radiation Tolerant Computer (RadPC)', provider: 'Montana State University', purpose: 'Test a computer\'s recovery from radiation-caused faults.', stage: 'operated', result: 'NASA: operated through the Van Allen belts and on the surface into the lunar night.' },
    { id: 'bg1-eds', name: 'Electrodynamic Dust Shield (EDS)', provider: 'NASA Kennedy Space Center', purpose: 'Remove dust from surfaces with electric fields.', stage: 'operated', result: 'NASA: used electrodynamic forces to lift and remove lunar regolith from surfaces.' },
    { id: 'bg1-lexi', name: 'Lunar Environment heliospheric X-ray Imager (LEXI)', provider: 'Boston University, NASA Goddard, Johns Hopkins University', purpose: 'Image the boundary of Earth\'s magnetic field in X-rays.', stage: 'operated', result: 'NASA: captured a series of X-ray images of solar wind interacting with Earth\'s magnetic field.' },
    { id: 'bg1-lms', name: 'Lunar Magnetotelluric Sounder (LMS)', provider: 'Southwest Research Institute', purpose: 'Measure electric and magnetic fields to study the Moon\'s mantle.', stage: 'operated', result: 'NASA: deployed five sensors; Firefly: electrodes reached up to 60 feet from the lander.' },
    { id: 'bg1-lugre', name: 'Lunar GNSS Receiver Experiment (LuGRE)', provider: 'NASA Goddard and the Italian Space Agency (ASI)', purpose: 'Test tracking of GPS and Galileo signals in transit and on the surface.', stage: 'operated', result: 'NASA: acquired and tracked GNSS signals in transit and on the surface, a first.' },
    { id: 'bg1-scalpss', name: 'Stereo Camera for Lunar Plume-Surface Studies (SCALPSS)', provider: 'NASA Langley Research Center', purpose: 'Image how the landing engine plume affects regolith.', stage: 'operated', result: 'NASA: about 9,000 images during descent and touchdown; also operated through lunar sunset into the night.' },
  ],
  timeline: [
    { when: '2025-03-02T03:34:00-05:00', event: 'Landing', note: '3:34 a.m. EST as printed by NASA.' },
    { when: '2025-03-16', event: 'End of mission', note: 'Firefly: final data about 6:15 p.m. CDT on March 16, just over 5 hours into the lunar night.' },
  ],
  achievements: [
    'Firefly: more than 14 days of surface operations (346 hours of daylight), 100 percent of mission objectives met, more than 119 GB returned including 51 GB of science and technology data.',
    'NASA: all 10 payloads named with reported results (see payloads).',
  ],
  limitations: ['Operations ended in the lunar night.'],
  unverified: [
    'No NASA or Firefly page I read prints landing coordinates, so NO precise marker is placed. The region is Mare Crisium, near Mons Latreille.',
    'Launch date is not in this record yet (the press kit gave only a target).',
  ],
  location: {
    kind: 'region-only',
    regionName: 'Mare Crisium, near Mons Latreille',
    note: 'The pages read name the region and a nearby volcanic feature but print no coordinates.',
  },
  sources: BG1_SOURCES,
};

const IM2_SOURCES: readonly SourceRef[] = [
  src('NASA: LRO views IM-2 on the Moon\'s surface', 'https://www.nasa.gov/image-article/nasas-lunar-reconnaissance-orbiter-views-im-2-on-moons-surface/'),
  src('NASA: NASA Receives Some Data Before Intuitive Machines Ends Lunar Mission', 'https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/'),
  src('NASA: IM-2 press kit (payload list)', 'https://www.nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf?emrc=6a82aab264837'),
];

const IM2: LandedMission = {
  id: 'im-2',
  name: 'Intuitive Machines IM-2',
  category: 'commercial-delivery',
  agency: 'NASA (CLPS customer)',
  country: 'United States',
  operator: 'Intuitive Machines',
  spacecraft: 'Athena',
  outcome: 'partial',
  landingDate: '2025-03-06',
  summary:
    'Athena reached the surface near the center of Mons Mouton, closer to the lunar South Pole than any previous lander (NASA), but ended up on its side in a crater and ended its mission early.',
  objectives: ['Deliver the NASA PRIME-1 drill and mass spectrometer suite and a laser retroreflector array to the Mons Mouton plateau.'],
  payloads: [
    { id: 'im2-trident', name: 'TRIDENT (The Regolith Ice Drill for Exploring New Terrain)', provider: 'Honeybee Robotics, a Blue Origin Company', purpose: 'Drill to about three feet to collect regolith and measure soil temperature at depth (part of PRIME-1).', stage: 'activated', result: 'NASA: demonstrated the hardware\'s full range of motion in space. The pages read do not say it collected soil.' },
    { id: 'im2-msolo', name: 'MSOLO (Mass Spectrometer Observing Lunar Operations)', provider: 'INFICON with NASA Kennedy Space Center', purpose: 'Identify and quantify volatiles at or beneath the surface (part of PRIME-1).', stage: 'operated', result: 'NASA: detected elements likely due to gases from the lander\'s propulsion system; no volatiles from the lunar surface were reported.' },
    { id: 'im2-lra', name: 'Laser Retroreflector Array (LRA)', provider: 'NASA Goddard Space Flight Center', purpose: 'Passive array of eight retroreflectors for laser ranging.', stage: 'delivered', passive: true, result: 'Passive; does not power on. No result is given in the pages read.' },
  ],
  timeline: [
    { when: '2025-03-06', event: 'Landing', note: 'NASA says touchdown was approximately 11:30 a.m.; the time zone is not stated in the text read.' },
    { when: '2025-03-07', event: 'Mission ended early', note: 'Company called end of mission at 12:15 a.m. CST Friday; LRO imaged the site at 12:54 p.m. EST on March 7.' },
  ],
  achievements: ['Closer to the lunar South Pole than any previous lander (NASA).', 'About 250 MB of data collected for NASA (NASA).'],
  limitations: [
    'Landed on its side in a crater, which kept the drill and other instruments from fully operating (NASA).',
    'Batteries were depleted (NASA).',
    'NASA gives touchdown about 400 m from the intended site in the text, but a photo caption says about 820 feet; the two figures conflict.',
  ],
  unverified: [
    'No page I read prints landing coordinates, so NO precise marker is placed. The site is Mons Mouton in the south polar region (press kit: within 6 degrees of the pole).',
    'Launch date is not in this record yet (the press kit gave only a target).',
    'Not stated: whether the drill collected soil, the per-payload breakdown of the data, the tilt angle, the cause of the battery depletion.',
  ],
  location: {
    kind: 'region-only',
    regionName: 'Mons Mouton, south polar region',
    note: 'Named by NASA; no latitude or longitude printed in the pages read.',
  },
  sources: IM2_SOURCES,
};

const PEREGRINE: FailedMission = {
  id: 'peregrine-1',
  name: 'Astrobotic Peregrine Mission One',
  category: 'commercial-delivery',
  agency: 'NASA (CLPS customer)',
  country: 'United States',
  operator: 'Astrobotic Technology',
  spacecraft: 'Peregrine',
  outcome: 'failed-no-landing',
  launchDate: '2024-01-08',
  summary:
    'Peregrine launched on the first flight of ULA\'s Vulcan, suffered a propulsion failure hours later, reached lunar distance but never landed, and was returned to Earth to burn up in the atmosphere.',
  objectives: ['Land on the Moon (intended landing site not stated by the page used).'],
  payloads: [],
  timeline: [
    { when: '2024-01-08', event: 'Launch on the first flight of ULA Vulcan' },
    { when: '2024-01-12', event: 'Reached lunar distance (about 238,000 miles from Earth)' },
    { when: '2024-01-18T20:50:00Z', event: 'Telemetry lost; reentry', note: '2050 UTC. Debris expected near 176.594 W, 23.087 S, south of Fiji.' },
  ],
  achievements: [],
  limitations: [
    'Astrobotic\'s preliminary finding: a valve between the helium pressurant and the oxidizer failed to reseal, a helium surge ruptured the oxidizer tank.',
    'It never landed on the Moon.',
  ],
  unverified: [
    'Its payload list and intended landing site are not in this record: the page used does not state them.',
  ],
  location: { kind: 'none', note: 'Never reached the lunar surface. No surface marker exists or should be drawn.' },
  sources: [src('Spaceflight Now: Astrobotic\'s Peregrine lunar lander ends mission in fiery reentry', 'https://spaceflightnow.com/2024/01/19/astrobotics-peregrine-lunar-lander-ends-mission-in-fiery-reentry/')],
};

export const MISSIONS: readonly Mission[] = [...APOLLO, IM1, BG1, IM2, PEREGRINE];

// ---- queries -------------------------------------------------------------------------

export function findMission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** A neutral marker description (the app's own marker type is a later, small adapter). */
export interface MarkerSite {
  readonly id: string;
  readonly name: string;
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly outcome: LandedMission['outcome'];
}

/**
 * Missions that may be drawn as a precise surface marker: they LANDED and a source printed a coordinate.
 * Failed attempts, plans, and region-only landings are excluded.
 */
export function markerSites(missions: readonly Mission[] = MISSIONS): MarkerSite[] {
  const out: MarkerSite[] = [];
  for (const m of missions) {
    if ((m.outcome === 'success' || m.outcome === 'partial') && m.location.kind === 'surface-point') {
      out.push({ id: m.id, name: m.name, latDeg: m.location.coordinate.latDeg, lonDeg: m.location.coordinate.lonDeg, outcome: m.outcome });
    }
  }
  return out;
}

// ---- validation ----------------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;

function checkCoordinate(label: string, c: Coordinate, problems: string[]): void {
  if (!(Number.isFinite(c.latDeg) && c.latDeg >= -90 && c.latDeg <= 90)) problems.push(`${label}: latitude ${String(c.latDeg)} out of range`);
  if (!(Number.isFinite(c.lonDeg) && c.lonDeg >= -180 && c.lonDeg <= 180)) problems.push(`${label}: longitude ${String(c.lonDeg)} out of range`);
  if (c.note.trim() === '') problems.push(`${label}: coordinate has no source note`);
}

function checkSource(label: string, s: SourceRef, problems: string[]): void {
  if (!/^https:\/\/[^\s]+$/.test(s.url)) problems.push(`${label}: source "${s.title}" is not an https link`);
  if (!DATE_ONLY.test(s.verified)) problems.push(`${label}: source "${s.title}" has no verification date`);
  if (s.title.trim() === '') problems.push(`${label}: a source has no title`);
}

/** Returns a list of problems; an empty list means the catalogue is internally consistent. */
export function validateCatalogue(missions: readonly Mission[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const m of missions) {
    const L = `mission ${m.id}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) problems.push(`${L}: id must be lower-case words joined by dashes`);
    if (ids.has(m.id)) problems.push(`${L}: duplicate id`);
    ids.add(m.id);
    if (m.name.trim() === '' || m.summary.trim() === '') problems.push(`${L}: name and summary are required`);
    if (m.sources.length === 0) problems.push(`${L}: needs at least one source`);
    m.sources.forEach((s) => checkSource(L, s, problems));

    // the status rules the types express, re-checked at run time for data that bypassed them
    const loc = m.location;
    if (m.outcome === 'failed-no-landing' && loc.kind !== 'none') problems.push(`${L}: a failed attempt cannot have a surface location`);
    if (m.outcome === 'planned' && loc.kind === 'surface-point') problems.push(`${L}: a planned mission cannot have a surface point`);
    if (loc.kind === 'surface-point') {
      checkCoordinate(`${L} location`, loc.coordinate, problems);
      if (m.outcome !== 'success' && m.outcome !== 'partial') problems.push(`${L}: only a landed mission may have a surface point`);
    }
    if (m.outcome === 'success' || m.outcome === 'partial') {
      if (!DATE_ONLY.test(m.landingDate)) problems.push(`${L}: landingDate must be YYYY-MM-DD`);
    }
    if (m.launchDate !== undefined && !DATE_ONLY.test(m.launchDate)) problems.push(`${L}: launchDate must be YYYY-MM-DD`);

    const pids = new Set<string>();
    for (const p of m.payloads) {
      if (pids.has(p.id)) problems.push(`${L}: duplicate payload id ${p.id}`);
      pids.add(p.id);
      if (p.name.trim() === '' || p.purpose.trim() === '') problems.push(`${L}: payload ${p.id} needs a name and purpose`);
      if (p.stage === 'operated' && p.passive === true) problems.push(`${L}: passive payload ${p.id} cannot be "operated"`);
      if (m.outcome === 'failed-no-landing' && p.stage !== 'planned') problems.push(`${L}: payload ${p.id} cannot have flown to the surface`);
    }
    for (const t of m.timeline) {
      if (!DATE_ONLY.test(t.when) && !DATE_TIME.test(t.when)) problems.push(`${L}: timeline date "${t.when}" is not ISO`);
    }
    for (const f of m.features ?? []) checkCoordinate(`${L} feature ${f.name}`, f.coordinate, problems);
    if (m.unverified.length === 0 && m.outcome !== 'success') problems.push(`${L}: partial, failed and planned records must say what is unverified`);
  }
  return problems;
}
