/**
 * Lunar landing sites shown as markers on the 3D Moon.
 *
 * The list is GENERATED from the mission catalogue (missionCatalogue.ts), so there is one
 * set of coordinates, and only missions that landed AND have a coordinate printed by a source
 * get a marker. Failed attempts, plans and region-only records never appear here.
 *
 * Coordinates are selenographic: latitude north-positive, longitude east-positive (degrees).
 * They are display coordinates, not navigation data.
 *
 * The LandingSite shape is unchanged, so the renderer and marker code need no changes.
 */
import { MISSIONS } from './missionCatalogue.ts';
import type { Mission } from './missionCatalogue.ts';
import { formatDateLong } from './missionDossierModel.ts';

export interface LandingSite {
  readonly id: string;
  readonly name: string;
  readonly mission: string;
  readonly landingDate: string;
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly description: string;
}

/** Marker names that were already in use before the catalogue and are kept as they were. */
const DISPLAY_NAME: Readonly<Record<string, string>> = {
  'apollo-11': 'Tranquility Base',
};

/** The marker description for a mission, or null when it must NOT have a marker. */
export function landingSiteFromMission(m: Mission): LandingSite | null {
  if (m.outcome !== 'success' && m.outcome !== 'partial') return null;
  if (m.location.kind !== 'surface-point') return null;
  const date = formatDateLong(m.landingDate);
  return {
    id: m.id,
    name: DISPLAY_NAME[m.id] ?? m.location.regionName,
    mission: m.name,
    // The catalogue dates for crewed landings come from NASA NSSDC, which lists them in UTC.
    landingDate: m.category === 'crewed-landing' ? `${date} (UTC)` : date,
    latitudeDeg: m.location.coordinate.latDeg,
    longitudeDeg: m.location.coordinate.lonDeg,
    description: m.summary,
  };
}

export function landingSitesFrom(missions: readonly Mission[]): LandingSite[] {
  const out: LandingSite[] = [];
  for (const m of missions) {
    const site = landingSiteFromMission(m);
    if (site !== null) out.push(site);
  }
  return out;
}

export const LANDING_SITES: readonly LandingSite[] = landingSitesFrom(MISSIONS);
