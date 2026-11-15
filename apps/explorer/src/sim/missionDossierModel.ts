/**
 * View-model for the mission browser and dossier: turns catalogue records into the
 * plain text, labels and lists the UI shows. Pure functions (no React, no Three.js),
 * so what the panel says can be tested in Node.
 */
import type { Coordinate, Mission, Payload, SourceRef, TimelineEvent } from './missionCatalogue.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2024-02-22" -> "22 February 2024". Anything that is not YYYY-MM-DD is returned unchanged. */
export function formatDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m === null) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (month === undefined) return iso;
  return `${String(Number(m[3]))} ${month} ${m[1]}`;
}

/** Timeline label. A time is shown with the offset it was printed with, never converted or guessed. */
export function formatWhen(iso: string): string {
  const t = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (t === null) return formatDateLong(iso);
  const zone = t[2] === 'Z' ? 'UTC' : `UTC${(t[2] ?? '').replace('-', '\u2212')}`;
  return `${formatDateLong(iso)}, ${t[1] ?? ''} (${zone})`;
}

/** "0.67416 N, 23.47314 E" style text with a degree sign; hemisphere letters, as printed by sources. */
export function formatCoordinate(c: Coordinate): { lat: string; lon: string; text: string } {
  const lat = `${Math.abs(c.latDeg)}\u00B0 ${c.latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(c.lonDeg)}\u00B0 ${c.lonDeg < 0 ? 'W' : 'E'}`;
  return { lat, lon, text: `${lat}, ${lon}` };
}

export type OutcomeTone = 'confirmed' | 'partial' | 'failed' | 'planned';

export function outcomeTone(m: Mission): OutcomeTone {
  switch (m.outcome) {
    case 'success':
      return 'confirmed';
    case 'partial':
      return 'partial';
    case 'failed-no-landing':
      return 'failed';
    case 'planned':
      return 'planned';
  }
}

/** The date used to order and label a mission: landing date if it landed, else launch date. */
export function missionDate(m: Mission): string | undefined {
  if (m.outcome === 'success' || m.outcome === 'partial') return m.landingDate;
  return m.launchDate;
}

export function missionDateLabel(m: Mission): string {
  const d = missionDate(m);
  if (d === undefined) return 'date not recorded';
  const kind = m.outcome === 'success' || m.outcome === 'partial' ? 'Landed' : 'Launched';
  return `${kind} ${formatDateLong(d)}`;
}

export interface LocationView {
  /** Short place name, if the sources gave one. */
  readonly place: string | undefined;
  /** Printed coordinate text, only when a source printed one. */
  readonly coordinates: string | undefined;
  /** How the position was obtained, as the source stated it. */
  readonly coordinateNote: string | undefined;
  /** Whether a marker exists on the globe for this mission. */
  readonly hasMarker: boolean;
  /** One plain sentence about the marker. */
  readonly markerNote: string;
}

export function locationView(m: Mission): LocationView {
  const loc = m.location;
  if (loc.kind === 'surface-point') {
    const c = formatCoordinate(loc.coordinate);
    return {
      place: loc.regionName,
      coordinates: c.text,
      coordinateNote: loc.coordinate.note,
      hasMarker: true,
      markerNote: 'Shown on the globe at the coordinate printed by the source.',
    };
  }
  if (loc.kind === 'region-only') {
    return {
      place: loc.regionName,
      coordinates: undefined,
      coordinateNote: loc.note,
      hasMarker: false,
      markerNote: 'No marker: the sources used name the region but print no coordinates, and none were estimated.',
    };
  }
  return {
    place: undefined,
    coordinates: undefined,
    coordinateNote: loc.note,
    hasMarker: false,
    markerNote: m.outcome === 'failed-no-landing' ? 'No marker: this mission never reached the lunar surface.' : 'No marker: no surface location is established.',
  };
}

export type PayloadTone = 'planned' | 'neutral' | 'passive' | 'partial' | 'confirmed' | 'failed';

export interface PayloadStatus {
  readonly tone: PayloadTone;
  /** Short status wording shown on the card. */
  readonly label: string;
  /** What the status means, in one sentence. */
  readonly detail: string;
  /** How many steps of the tracker are reached: 0 planned, 1 delivered, 2 activated, 3 operated. */
  readonly step: 0 | 1 | 2 | 3;
}

/** The tracker steps, in order. A payload can only reach a step the sources support. */
export const PAYLOAD_STEPS = ['Planned', 'Delivered', 'Activated', 'Operated'] as const;

/**
 * Planned, attempted and confirmed are kept apart:
 *  - planned: not shown to have flown;
 *  - delivered: it reached the surface, nothing more is claimed;
 *  - activated: switched on or exercised, but the sources do not say it produced its science;
 *  - operated: it ran, with a result where one is documented (partial results are labelled partial).
 */
export function payloadStatus(p: Payload): PayloadStatus {
  switch (p.stage) {
    case 'planned':
      return { tone: 'planned', label: 'Planned', detail: 'Not shown to have flown.', step: 0 };
    case 'delivered':
      return p.passive === true
        ? { tone: 'passive', label: 'Delivered (passive device)', detail: 'It reached the surface. It has no power-up to report.', step: 1 }
        : { tone: 'neutral', label: 'Delivered', detail: 'It reached the surface; the sources used do not report it operating.', step: 1 };
    case 'activated':
      return { tone: 'partial', label: 'Activated, not fully demonstrated', detail: 'Switched on or exercised; the sources used do not report its science result.', step: 2 };
    case 'operated':
      if (p.achievement === 'partial') return { tone: 'partial', label: 'Operated, partial result', detail: 'It ran, but a source says only part of its objective was met.', step: 3 };
      if (p.achievement === 'not-achieved') return { tone: 'failed', label: 'Operated, objective not met', detail: 'It ran, but a source says its objective was not achieved.', step: 3 };
      return { tone: 'confirmed', label: 'Operated', detail: p.result !== undefined ? 'It ran and a source documents a result.' : 'It ran; no result text is recorded.', step: 3 };
  }
}

export interface PayloadView {
  readonly id: string;
  readonly name: string;
  readonly provider: string | undefined;
  readonly purpose: string;
  /** Only present when a source states a scientific objective separately from the purpose. */
  readonly objective: string | undefined;
  readonly status: PayloadStatus;
  readonly result: string;
  readonly hasResult: boolean;
}

export const NO_RESULT_TEXT = 'No result reported in the sources used.';

export function payloadView(p: Payload): PayloadView {
  return {
    id: p.id,
    name: p.name,
    provider: p.provider,
    purpose: p.purpose,
    objective: p.objective,
    status: payloadStatus(p),
    result: p.result ?? NO_RESULT_TEXT,
    hasResult: p.result !== undefined,
  };
}

export interface TimelineView {
  readonly when: string;
  readonly event: string;
  readonly note: string | undefined;
}

export function timelineView(t: readonly TimelineEvent[]): TimelineView[] {
  return t.map((e) => ({ when: formatWhen(e.when), event: e.event, note: e.note }));
}

export interface SourceView {
  readonly title: string;
  readonly url: string;
  readonly verifiedLabel: string;
}

export function sourceViews(s: readonly SourceRef[]): SourceView[] {
  return s.map((x) => ({ title: x.title, url: x.url, verifiedLabel: `read ${formatDateLong(x.verified)}` }));
}

export const CATEGORY_LABEL: Readonly<Record<Mission['category'], string>> = {
  'crewed-landing': 'Crewed landing',
  'commercial-delivery': 'Commercial delivery',
};

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** True when the value says "not established" rather than stating a fact. */
  readonly missing: boolean;
}

/** The key-facts grid at the top of the overview. Missing facts say so instead of vanishing. */
export function keyFacts(m: Mission): Fact[] {
  const loc = locationView(m);
  // Order matters: the overview shows these in a two-column grid, so Operator|Spacecraft and Date|Coordinates
  // are pairs, and Agency and Site (longer text) take a full row each.
  const facts: Fact[] = [
    { label: 'Operator', value: m.operator, missing: false },
    m.spacecraft !== undefined ? { label: 'Spacecraft', value: m.spacecraft, missing: false } : { label: 'Spacecraft', value: 'Not recorded', missing: true },
    { label: 'Date', value: missionDateLabel(m).replace(/^(Landed|Launched) /, ''), missing: missionDate(m) === undefined },
    { label: 'Coordinates', value: loc.coordinates ?? 'Not established', missing: loc.coordinates === undefined },
    { label: 'Agency', value: `${m.agency}, ${m.country}`, missing: false },
    { label: 'Site', value: loc.place ?? 'No surface location', missing: loc.place === undefined },
  ];
  return facts;
}

export interface DossierTab {
  readonly id: 'overview' | 'payloads' | 'timeline' | 'sources';
  readonly label: string;
  readonly count: number | undefined;
}

/** Tabs shown for a mission. Overview and Sources always exist; others only when there is content. */
export function dossierTabs(m: Mission): DossierTab[] {
  const tabs: DossierTab[] = [{ id: 'overview', label: 'Overview', count: undefined }];
  if (m.payloads.length > 0) tabs.push({ id: 'payloads', label: 'Payloads', count: m.payloads.length });
  if (m.timeline.length > 0) tabs.push({ id: 'timeline', label: 'Timeline', count: m.timeline.length });
  tabs.push({ id: 'sources', label: 'Sources', count: m.sources.length });
  return tabs;
}
