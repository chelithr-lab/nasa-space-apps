import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimStore, UiSnapshot } from '../sim/simStore.ts';
import type { ElevationRaster } from '../sim/lunarElevation.ts';
import { buildSiteModel, evaluateSite } from '../sim/solarSite.ts';
import type { SiteModel, SiteSolarState } from '../sim/solarSite.ts';
import {
  elevationRate,
  extractEvents,
  samplerFromSnapshots,
  scanSite,
  sunSampleFromSnapshot,
} from '../sim/solarScan.ts';
import type { ScanControl, SiteScan, SolarEvent } from '../sim/solarScan.ts';
import { computeSnapshotLive } from '../sim/liveCompute.ts';

const DAY_MS = 86_400_000;
/** Events window: 30 days each way, so the sunrise before and the sunrise after ANY time are inside it (a sunrise-to-sunrise cycle is about 29.5 days). */
const EVENTS_BACK_MS = 30 * DAY_MS;
const EVENTS_AHEAD_MS = 30 * DAY_MS;
/** When the simulation time comes within this of a window edge, the window is re-centred. */
const EVENTS_MARGIN_MS = 2 * DAY_MS;

export type AnalysisPeriodId = '1h' | '24h' | '7d' | '30d';
export const PERIOD_MS: Readonly<Record<AnalysisPeriodId, number>> = { '1h': 3_600_000, '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS };
export const PERIOD_LABEL: Readonly<Record<AnalysisPeriodId, string>> = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

export interface SelectedSite {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export interface SolarSiteData {
  readonly site: SiteModel | null;
  /** The Sun at the shared simulation time (null if the astronomy could not be computed). */
  readonly current: SiteSolarState | null;
  readonly error: string | null;
  readonly events: { readonly scan: SiteScan; readonly list: readonly SolarEvent[] } | null;
  readonly eventsBusy: boolean;
  readonly energyScan: SiteScan | null;
  readonly energyBusy: boolean;
  readonly energyProgress: number;
  /** Start of the analysed period (the simulation time when the analysis was requested). */
  readonly analysisStartMs: number | null;
  readonly reanalyse: () => void;
}

const sampler = samplerFromSnapshots(computeSnapshotLive);

/**
 * All calculations for the ONE selected site. Nothing here runs unless a site is
 * selected. The site model (terrain horizon) is built once per selection; the
 * current state is a cheap evaluation at the shared simulation time; the two
 * scans (events, energy) run asynchronously, in slices, and are cancelled when
 * superseded, so a stale result can never be shown for a different site.
 * Panel settings are NOT dependencies of any scan: changing the panel re-integrates
 * the same samples in the component.
 */
export function useSolarSite(
  store: SimStore,
  ui: UiSnapshot,
  selected: SelectedSite | null,
  raster: ElevationRaster | null,
  period: AnalysisPeriodId,
): SolarSiteData {
  const simMs = ui.clock.simMs;
  const simRef = useRef(simMs);
  simRef.current = simMs;
  void store;

  const site = useMemo<SiteModel | null>(() => {
    if (selected === null) return null;
    try {
      return buildSiteModel(raster, selected.latDeg, selected.lonDeg);
    } catch {
      return null;
    }
  }, [selected, raster]);

  const current = useMemo<{ state: SiteSolarState | null; error: string | null }>(() => {
    if (site === null) return { state: null, error: null };
    const snap = ui.snapshot;
    if (snap === null) return { state: null, error: ui.computeError ?? 'The Sun position is not available for this time.' };
    try {
      const rate = elevationRate(site, sampler, snap.utcMs);
      return { state: evaluateSite(site, sunSampleFromSnapshot(snap), rate), error: null };
    } catch (e) {
      return { state: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [site, ui.snapshot, ui.computeError]);

  // ---- events window (re-centred only when the time leaves its safe zone)
  const [eventAnchor, setEventAnchor] = useState<number | null>(null);
  const [events, setEvents] = useState<SolarSiteData['events']>(null);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(null);
    setEventAnchor(site === null ? null : simRef.current);
  }, [site]);

  useEffect(() => {
    if (site === null || eventAnchor === null) return;
    const control: ScanControl = { cancelled: false };
    setEventsBusy(true);
    setScanError(null);
    void scanSite(site, sampler, eventAnchor - EVENTS_BACK_MS, eventAnchor + EVENTS_AHEAD_MS, { control })
      .then((scan) => {
        if (control.cancelled) return;
        setEvents({ scan, list: extractEvents(scan, site, sampler) });
        setEventsBusy(false);
      })
      .catch((e: unknown) => {
        if (control.cancelled) return;
        setScanError(e instanceof Error ? e.message : String(e));
        setEventsBusy(false);
      });
    return () => {
      control.cancelled = true;
    };
  }, [site, eventAnchor]);

  useEffect(() => {
    if (events === null || eventsBusy) return;
    const { t0, t1 } = events.scan;
    if (simMs < t0 + EVENTS_MARGIN_MS || simMs > t1 - EVENTS_MARGIN_MS) setEventAnchor(simMs);
  }, [simMs, events, eventsBusy]);

  // ---- energy period (anchored at selection / period change / explicit request, NOT at every clock tick)
  const [rev, setRev] = useState(0);
  const [energyScan, setEnergyScan] = useState<SiteScan | null>(null);
  const [energyBusy, setEnergyBusy] = useState(false);
  const [energyProgress, setEnergyProgress] = useState(0);
  const [analysisStartMs, setAnalysisStartMs] = useState<number | null>(null);

  useEffect(() => {
    setEnergyScan(null);
    if (site === null) {
      setAnalysisStartMs(null);
      return;
    }
    const t0 = simRef.current;
    setAnalysisStartMs(t0);
    const control: ScanControl = { cancelled: false };
    setEnergyBusy(true);
    setEnergyProgress(0);
    void scanSite(site, sampler, t0, t0 + PERIOD_MS[period], { control, onProgress: (f) => { if (!control.cancelled) setEnergyProgress(f); } })
      .then((scan) => {
        if (control.cancelled) return;
        setEnergyScan(scan);
        setEnergyBusy(false);
      })
      .catch((e: unknown) => {
        if (control.cancelled) return;
        setScanError(e instanceof Error ? e.message : String(e));
        setEnergyBusy(false);
      });
    return () => {
      control.cancelled = true;
    };
  }, [site, period, rev]);

  return {
    site,
    current: current.state,
    error: current.error ?? scanError,
    events,
    eventsBusy,
    energyScan,
    energyBusy,
    energyProgress,
    analysisStartMs,
    reanalyse: () => setRev((r) => r + 1),
  };
}
