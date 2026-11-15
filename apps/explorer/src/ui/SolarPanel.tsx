import { useMemo, useState } from 'react';
import '../styles/solar.css';
import type { SimStore } from '../sim/simStore.ts';
import { useSimUi } from './hooks.ts';
import { CONDITION_LABEL, horizonAngleAt, HORIZON_AZIMUTH_BINS, MAX_HORIZON_KM } from '../sim/solarSite.ts';
import type { SiteSolarState } from '../sim/solarSite.ts';
import { EVENT_LABEL, summariseDaylight } from '../sim/solarScan.ts';
import type { SolarEvent } from '../sim/solarScan.ts';
import {
  DEFAULT_PANEL,
  PANEL_MODE_LABEL,
  SOLAR_IRRADIANCE_1AU_WM2,
  formatDuration,
  formatEnergy,
  integratePower,
  panelPower,
  powerSeries,
  validatePanel,
} from '../sim/solarPower.ts';
import type { PanelConfig, PanelMode } from '../sim/solarPower.ts';
import { daylightCycle, ringPoint, scaleLinear, skyPoint, timeAtX } from '../sim/solarView.ts';
import { PERIOD_LABEL, useSolarSite } from './useSolarSite.ts';
import type { AnalysisPeriodId, SelectedSite } from './useSolarSite.ts';
import type { ElevationRaster } from '../sim/lunarElevation.ts';

const HOUR = 3600;
const fmtLat = (v: number): string => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number): string => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'E' : 'W'}`;
const fmtUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const fmtW = (w: number): string => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w.toFixed(w >= 100 ? 0 : 1)} W`);

function directSunText(s: SiteSolarState): { label: string; detail: string } {
  if (!s.geometricSunUp) return { label: 'No direct sunlight', detail: 'The Sun is below the geometric horizon (the Moon itself is in the way: night).' };
  if (s.terrainBlocked) return { label: 'No direct sunlight', detail: `The Sun is above the geometric horizon but below the terrain horizon (${s.horizonDeg.toFixed(2)}°) in that direction: blocked by terrain.` };
  if (s.eclipseCovered >= 1) return { label: 'No direct sunlight', detail: 'The Earth covers the whole Sun (lunar eclipse).' };
  if (s.eclipseCovered > 0) return { label: 'Direct sunlight (partly eclipsed)', detail: `${(s.eclipseCovered * 100).toFixed(1)} % of the Sun's disc is covered by the Earth.` };
  return { label: 'Direct sunlight', detail: 'The Sun is above the terrain horizon and not eclipsed.' };
}

/** How the panel is shown. It is the SAME component and state in all three; only the layout changes. */
export type SolarView = 'minimized' | 'expanded' | 'fullscreen';

export interface SolarPanelProps {
  store: SimStore;
  selected: SelectedSite;
  raster: ElevationRaster | null;
  onClose: () => void;
  /** Layout state, owned by the parent so it can survive a change of Moon viewing mode. Default: expanded. */
  view?: SolarView;
  onViewChange?: ((view: SolarView) => void) | undefined;
}

export function SolarPanel({ store, selected, raster, onClose, view = 'expanded', onViewChange }: SolarPanelProps) {
  const ui = useSimUi(store);
  const [period, setPeriod] = useState<AnalysisPeriodId>('24h');
  const [panel, setPanel] = useState<PanelConfig>(DEFAULT_PANEL);
  const data = useSolarSite(store, ui, selected, raster, period);
  const { site, current } = data;
  const panelErrors = validatePanel(panel);
  const simMs = ui.clock.simMs;

  const power = useMemo(() => (site !== null && current !== null && panelErrors.length === 0 ? panelPower(current, site.frame, panel) : null), [site, current, panel, panelErrors.length]);
  const energy = useMemo(() => {
    if (site === null || data.energyScan === null || data.energyScan.states.length < 2 || panelErrors.length > 0) return null;
    return integratePower(data.energyScan.states, site.frame, panel);
  }, [site, data.energyScan, panel, panelErrors.length]);
  const series = useMemo(() => (site !== null && data.energyScan !== null && panelErrors.length === 0 ? powerSeries(data.energyScan.states, site.frame, panel) : []), [site, data.energyScan, panel, panelErrors.length]);
  const comparison = useMemo(() => {
    if (site === null || data.energyScan === null || data.energyScan.states.length < 2 || panelErrors.length > 0) return null;
    const modes: PanelMode[] = ['horizontal', 'tilted', 'tracking'];
    return modes.map((m) => ({ mode: m, r: integratePower(data.energyScan!.states, site.frame, { ...panel, mode: m }) }));
  }, [site, data.energyScan, panel, panelErrors.length]);

  const cycle = data.events !== null ? daylightCycle(data.events.list, data.events.scan, simMs) : null;
  const daylight = data.events !== null && current !== null ? summariseDaylight(data.events.list, data.events.scan, current) : null;

  const shownEvents = useMemo(() => {
    if (data.events === null) return [] as SolarEvent[];
    const all = data.events.list;
    const past = all.filter((e) => e.utcMs <= simMs).slice(-3);
    const next = all.filter((e) => e.utcMs > simMs).slice(0, 8);
    return [...past, ...next];
  }, [data.events, simMs]);

  const step = (seconds: number): void => store.stepSeconds(seconds);
  const num = (v: string, fallback: number): number => (v.trim() === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

  const setView = (v: SolarView): void => onViewChange?.(v);

  if (view === 'minimized') {
    // A small discreet pill: where, and whether the Sun reaches it now. Nothing else is drawn, so it costs almost nothing.
    return (
      <section className="solar-panel sp-min" aria-label="Lunar Solar Intelligence (minimised)">
        <button type="button" className="sp-min-open" onClick={() => setView('expanded')} aria-label="Open Lunar Solar Intelligence" title="Open Lunar Solar Intelligence">
          <span className="sp-kicker">LSI</span>
          <span className="sp-min-site">{fmtLat(selected.latDeg)}, {fmtLon(selected.lonDeg)}</span>
          {current !== null ? (
            <span className="sp-cond" data-cond={current.condition}><span className="sp-badge">{CONDITION_LABEL[current.condition]}</span></span>
          ) : (
            <span className="sp-fine">{data.error !== null ? 'unavailable' : 'calculating…'}</span>
          )}
        </button>
        <button type="button" className="sp-close" onClick={onClose} aria-label="Clear the selected site">&times;</button>
      </section>
    );
  }

  return (
    <section className={`solar-panel ${view === 'fullscreen' ? 'sp-full' : 'sp-side'}`} aria-label="Lunar Solar Intelligence">
      <header className="sp-head">
        <div>
          <div className="sp-kicker">Lunar Solar Intelligence</div>
          <div className="sp-title">{fmtLat(selected.latDeg)}, {fmtLon(selected.lonDeg)}</div>
          <div className="sp-sub">
            {site?.heightM != null ? `Terrain height ${(site.heightM / 1000).toFixed(2)} km above the 1737.4 km reference sphere` : 'Terrain height unavailable (elevation data not loaded)'}
            {site?.regionalSlopeDeg != null ? ` · regional slope ${site.regionalSlopeDeg.toFixed(1)}° (about 4 km scale)` : ''}
          </div>
        </div>
        <div className="sp-actions">
          <button type="button" className="sp-close" onClick={() => setView('minimized')} aria-label="Minimise to a small indicator" title="Minimise">&minus;</button>
          <button
            type="button"
            className="sp-close"
            onClick={() => setView(view === 'fullscreen' ? 'expanded' : 'fullscreen')}
            aria-label={view === 'fullscreen' ? 'Restore the panel to the edge' : 'Open fullscreen analysis workspace'}
            title={view === 'fullscreen' ? 'Restore (Esc)' : 'Fullscreen'}
          >
            {view === 'fullscreen' ? '\u2921' : '\u2922'}
          </button>
          <button type="button" className="sp-close" onClick={onClose} aria-label="Clear the selected site" title="Clear the selected site">&times;</button>
        </div>
      </header>

      <div className="sp-body">
      {data.error !== null && <p className="sp-warn" role="alert">{data.error}</p>}
      {site === null && <p className="sp-warn">This location could not be analysed.</p>}

      {site !== null && current !== null && (
        <>
          <div className="sp-cond" data-cond={current.condition}>
            <span className="sp-badge">{CONDITION_LABEL[current.condition]}</span>
            <span>{directSunText(current).label}</span>
          </div>
          <p className="sp-note">{directSunText(current).detail}</p>
          <dl className="sp-grid">
            <div><dt>Sun elevation</dt><dd>{current.elevationDeg.toFixed(2)}&deg;</dd></div>
            <div><dt>Sun azimuth</dt><dd>{current.azimuthDeg.toFixed(1)}&deg;</dd></div>
            <div><dt>Terrain horizon there</dt><dd>{current.horizonDeg.toFixed(2)}&deg;</dd></div>
            <div><dt>Sun distance</dt><dd>{current.sunDistanceAu.toFixed(5)} au</dd></div>
          </dl>
          <p className="sp-fine">Elevation and azimuth are for the centre of the Sun's disc; azimuth is clockwise from local north. Terrain horizon: LOLA raster within {MAX_HORIZON_KM} km, cells about 1.9 km: smaller features are not resolved.</p>

          <h4>Daylight cycle</h4>
          <div className="sp-row">
            <svg viewBox="-60 -60 120 120" width="118" height="118" role="img" aria-label="Daylight cycle ring">
              <circle r="46" fill="none" stroke="#1c2a3d" strokeWidth="10" />
              {cycle !== null && <path d={arcPath(0, cycle.dayFraction, 46)} fill="none" stroke="#f2b84b" strokeWidth="10" />}
              {cycle !== null && <circle cx={ringPoint(cycle.nowFraction, 46).x} cy={ringPoint(cycle.nowFraction, 46).y} r="6" fill="#38e8ff" stroke="#03111c" strokeWidth="2" />}
              <text textAnchor="middle" y="-2" fontSize="9" fill="#cfe1f3">{cycle === null ? 'cycle' : current.geometricSunUp ? 'DAY' : 'NIGHT'}</text>
              <text textAnchor="middle" y="9" fontSize="6.5" fill="#7ea2c4">{cycle === null ? 'unavailable' : 'sunrise at top'}</text>
            </svg>
            <ul className="sp-list">
              {daylight !== null ? (
                <>
                  {daylight.sinceSunriseMs !== null && <li>Since sunrise: <b>{formatDuration(daylight.sinceSunriseMs / 1000)}</b></li>}
                  {daylight.untilSunsetMs !== null && <li>Until sunset: <b>{formatDuration(daylight.untilSunsetMs / 1000)}</b></li>}
                  {daylight.untilSunriseMs !== null && <li>Until sunrise: <b>{formatDuration(daylight.untilSunriseMs / 1000)}</b></li>}
                  {daylight.note !== null && <li className="sp-fine">{daylight.note}</li>}
                </>
              ) : (
                <li className="sp-fine">{data.eventsBusy ? 'Calculating sunrise and sunset…' : 'Not available.'}</li>
              )}
              <li className="sp-fine">A lunar day is about 29.5 Earth days: sunrise to sunrise, not 24 hours. Times are Sun-centre crossings of the horizon.</li>
            </ul>
          </div>

          <h4>Sun path (looking up)</h4>
          <SkyPlot site={site} current={current} data={data} cycleStart={cycle?.startMs ?? null} cycleEnd={cycle?.sunsetMs ?? null} />

          <h4>Solar power <span className="sp-tag">assumptions, not equipment</span></h4>
          {power !== null ? (
            <>
              <div className="sp-power">
                <div className="sp-power-label">Current electrical output</div>
                <div className="sp-power-value">{fmtW(power.electricalW)}</div>
                {power.zeroReason !== null && <div className="sp-fine">0 W because: {({ darkness: 'the Sun is below the horizon', 'terrain-shadow': 'terrain blocks the Sun', eclipse: 'the Earth covers the Sun', 'panel-faces-away': 'the Sun is behind the panel' } as const)[power.zeroReason]}</div>}
              </div>
              <dl className="sp-stages">
                <div><dt>Solar irradiance at the Moon</dt><dd>{power.solarIrradianceWm2.toFixed(1)} W/m&sup2;</dd></div>
                <div><dt>Direct normal irradiance</dt><dd>{power.directNormalWm2.toFixed(1)} W/m&sup2;</dd></div>
                <div><dt>Panel incident irradiance</dt><dd>{power.incidentWm2.toFixed(1)} W/m&sup2;</dd></div>
                <div><dt>Incident solar power</dt><dd>{fmtW(power.incidentW)}</dd></div>
                <div><dt>Electrical power</dt><dd>{fmtW(power.electricalW)}</dd></div>
              </dl>
              <p className="sp-fine">Irradiance = {SOLAR_IRRADIANCE_1AU_WM2} W/m&sup2; &times; (1 au / Sun distance)&sup2;. Direct sunlight only: no reflected light, no panel mounting height, no dust or temperature effects.</p>
            </>
          ) : (
            panelErrors.length > 0 && <p className="sp-warn">{panelErrors.join(' ')}</p>
          )}

          <fieldset className="sp-form">
            <legend>Panel</legend>
            <label>Type
              <select value={panel.mode} onChange={(e) => setPanel({ ...panel, mode: e.target.value as PanelMode })}>
                {(Object.keys(PANEL_MODE_LABEL) as PanelMode[]).map((m) => <option key={m} value={m}>{PANEL_MODE_LABEL[m]}</option>)}
              </select>
            </label>
            <label>Area (m&sup2;)<input type="number" min="0" step="1" value={panel.areaM2} onChange={(e) => setPanel({ ...panel, areaM2: num(e.target.value, panel.areaM2) })} /></label>
            <label>Efficiency (%)<input type="number" min="0" max="100" step="1" value={panel.efficiencyPct} onChange={(e) => setPanel({ ...panel, efficiencyPct: num(e.target.value, panel.efficiencyPct) })} /></label>
            <label>System losses (%)<input type="number" min="0" max="100" step="1" value={panel.lossesPct} onChange={(e) => setPanel({ ...panel, lossesPct: num(e.target.value, panel.lossesPct) })} /></label>
            {panel.mode === 'tilted' && (
              <>
                <label>Tilt from level (&deg;)<input type="number" min="0" max="90" step="1" value={panel.tiltDeg} onChange={(e) => setPanel({ ...panel, tiltDeg: num(e.target.value, panel.tiltDeg) })} /></label>
                <label>Faces (&deg; from north, 90 = east)<input type="number" min="0" max="360" step="5" value={panel.azimuthDeg} onChange={(e) => setPanel({ ...panel, azimuthDeg: num(e.target.value, panel.azimuthDeg) })} /></label>
              </>
            )}
            {panel.mode === 'tracking' && <p className="sp-fine">Idealised: the panel is assumed to face the Sun exactly. No tracking mechanism is simulated.</p>}
            {panel.mode === 'horizontal' && <p className="sp-fine">&ldquo;Level&rdquo; means perpendicular to the local vertical, not tilted to the terrain slope.</p>}
          </fieldset>

          <h4>Energy over a period</h4>
          <div className="sp-seg" role="group" aria-label="Analysis period">
            {(Object.keys(PERIOD_LABEL) as AnalysisPeriodId[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
            ))}
            <button type="button" onClick={data.reanalyse} title="Re-run the period starting at the current simulation time">From now</button>
          </div>
          {data.analysisStartMs !== null && <p className="sp-fine">Period: {fmtUtc(data.analysisStartMs)} for {PERIOD_LABEL[period]}. It does not follow the clock; use &ldquo;From now&rdquo; to restart it.</p>}
          {data.energyBusy && <p className="sp-fine" role="status">Calculating… {Math.round(data.energyProgress * 100)} %</p>}
          {energy !== null && (
            <>
              <dl className="sp-grid">
                <div><dt>Energy generated</dt><dd className="sp-hi">{formatEnergy(energy.energyWh)}</dd></div>
                <div><dt>Average power</dt><dd>{fmtW(energy.averageW)}</dd></div>
                <div><dt>Peak power</dt><dd>{fmtW(energy.peakW)}</dd></div>
                <div><dt>Minimum power</dt><dd>{fmtW(energy.minW)}</dd></div>
                <div><dt>Time generating</dt><dd>{formatDuration(energy.generatingS)}</dd></div>
                <div><dt>Time at zero</dt><dd>{formatDuration(energy.zeroS)}</dd></div>
              </dl>
              <p className="sp-fine">Energy (Wh) is the integral of power (W) over time, from {energy.sampleCount} samples (coarse step {formatDuration((data.energyScan?.stepMs ?? 0) / 1000)}, refined to {(data.energyScan?.refineMs ?? 0) / 1000} s at every sunrise, sunset and terrain-shadow edge).</p>
            </>
          )}
          <PowerGraph series={series} t0={data.energyScan?.t0 ?? null} t1={data.energyScan?.t1 ?? null} nowMs={simMs} onPick={(ms) => store.setSimMs(ms)} />

          {comparison !== null && (
            <>
              <h4>Panel types, same site and period</h4>
              <table className="sp-table">
                <thead><tr><th>Type</th><th>Peak</th><th>Average</th><th>Energy</th><th>Zero for</th></tr></thead>
                <tbody>
                  {comparison.map(({ mode, r }) => (
                    <tr key={mode} className={mode === panel.mode ? 'sp-cur' : ''}>
                      <td>{PANEL_MODE_LABEL[mode]}</td><td>{fmtW(r.peakW)}</td><td>{fmtW(r.averageW)}</td><td>{formatEnergy(r.energyWh)}</td><td>{formatDuration(r.zeroS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sp-fine">Fixed-tilt row uses the tilt and direction entered above. Only the type differs; area, efficiency and losses are identical.</p>
            </>
          )}

          <h4>Solar events</h4>
          {data.eventsBusy && data.events === null && <p className="sp-fine" role="status">Searching for sunrise, sunset and shadow events…</p>}
          {data.events !== null && (
            <>
              <ul className="sp-events">
                {shownEvents.map((e) => (
                  <li key={`${e.kind}-${e.utcMs}`} className={e.utcMs <= simMs ? 'sp-past' : ''}>
                    <button type="button" onClick={() => store.setSimMs(e.utcMs)} title="Move the simulation clock to this event">
                      <span>{EVENT_LABEL[e.kind]}</span>
                      <span>{fmtUtc(e.utcMs)}</span>
                    </button>
                  </li>
                ))}
                {shownEvents.length === 0 && <li className="sp-fine">No events in the calculated window ({fmtUtc(data.events.scan.t0)} to {fmtUtc(data.events.scan.t1)}).</li>}
              </ul>
              <p className="sp-fine">Window {fmtUtc(data.events.scan.t0)} to {fmtUtc(data.events.scan.t1)}. Only events actually found are listed. A sunlit or dark spell shorter than {formatDuration(data.events.scan.stepMs / 1000)} between samples could be missed.</p>
            </>
          )}

          <h4>Explore other times</h4>
          <div className="sp-seg" role="group" aria-label="Move the shared simulation clock">
            <button type="button" onClick={() => step(3 * HOUR)}>+3 h</button>
            <button type="button" onClick={() => step(24 * HOUR)}>+1 d</button>
            <button type="button" onClick={() => step(3 * 24 * HOUR)}>+3 d</button>
            <button type="button" onClick={() => step(7 * 24 * HOUR)}>+1 wk</button>
            <button type="button" onClick={() => step(30 * 24 * HOUR)}>+30 d</button>
          </div>
          <p className="sp-fine">These move the one shared simulation clock (use the time bar for a custom date).</p>

          <details className="sp-limits">
            <summary>Data quality and limitations</summary>
            <ul>
              <li>Terrain: LOLA LDEM_16 cell means (about 1.9 km). Craters, rims and boulders smaller than a few cells are smoothed or absent, so real shadows near a lander can differ greatly.</li>
              <li>Permanently shadowed regions are not identified; that needs far finer data than this raster.</li>
              <li>Sun position: the app's astronomy and the IAU Moon-fixed frame; Sun treated as a point at its centre; sunrise is when that centre crosses the horizon (the disc takes about an hour to rise).</li>
              <li>Raster orientation is still being verified (see the orientation checker); an unverified orientation would move terrain relative to the Sun.</li>
              <li>Not a landing-safety assessment. No Solar Conditions Score, two-site comparison or report is provided yet.</li>
            </ul>
          </details>
        </>
      )}
      </div>
    </section>
  );
}

/** SVG arc along the ring from fraction a to b (clockwise from the top). */
function arcPath(a: number, b: number, r: number): string {
  const p0 = ringPoint(a, r);
  const p1 = ringPoint(Math.min(b, 0.99999), r);
  const large = b - a > 0.5 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

function SkyPlot({ site, current, data, cycleStart, cycleEnd }: { site: NonNullable<ReturnType<typeof useSolarSite>['site']>; current: SiteSolarState; data: ReturnType<typeof useSolarSite>; cycleStart: number | null; cycleEnd: number | null }) {
  const R = 78;
  const horizon = useMemo(() => {
    const pts: string[] = [];
    for (let az = 0; az < HORIZON_AZIMUTH_BINS; az += 2) {
      const p = skyPoint(Math.max(0, horizonAngleAt(site.horizon, az)), az, R);
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [site]);
  const path = useMemo(() => {
    const coarse = data.events?.scan.coarseStates ?? [];
    const sel = cycleStart !== null && cycleEnd !== null ? coarse.filter((s) => s.utcMs >= cycleStart && s.utcMs <= cycleEnd) : coarse;
    const stride = Math.max(1, Math.floor(sel.length / 160));
    return sel.filter((_, i) => i % stride === 0).filter((s) => s.elevationDeg >= 0);
  }, [data.events, cycleStart, cycleEnd]);
  const sun = skyPoint(current.elevationDeg, current.azimuthDeg, R);
  return (
    <div>
      <svg viewBox="-96 -96 192 192" width="100%" style={{ maxWidth: 260 }} role="img" aria-label="Sky plot of the Sun's path as seen from the selected site">
        <circle r={R} fill="#050d18" stroke="#34506e" />
        <circle r={R * (2 / 3)} fill="none" stroke="#1c2a3d" />
        <circle r={R * (1 / 3)} fill="none" stroke="#1c2a3d" />
        <polygon points={horizon} fill="rgba(170,120,80,0.35)" stroke="#c98a56" strokeWidth="0.8" />
        <text y={-R - 6} textAnchor="middle" fontSize="8" fill="#9fc0de">N</text>
        <text y={R + 12} textAnchor="middle" fontSize="8" fill="#9fc0de">S</text>
        <text x={-R - 9} y="3" textAnchor="middle" fontSize="8" fill="#9fc0de">E</text>
        <text x={R + 9} y="3" textAnchor="middle" fontSize="8" fill="#9fc0de">W</text>
        {path.map((s) => {
          const p = skyPoint(s.elevationDeg, s.azimuthDeg, R);
          return <circle key={s.utcMs} cx={p.x} cy={p.y} r="1.1" fill={s.terrainBlocked ? '#c98a56' : '#f2b84b'} />;
        })}
        {current.elevationDeg >= -1 && <circle cx={sun.x} cy={sun.y} r="4.5" fill={current.directSunlight ? '#ffd479' : '#6b7a8c'} stroke="#fff" strokeWidth="0.8" />}
      </svg>
      <p className="sp-fine">
        Looking up: north at the top, so east is on the LEFT. Centre = overhead, rim = horizon. Brown = terrain horizon (raster-limited). Dots = calculated Sun positions over this day{cycleStart === null ? ' (the full calculated window)' : ' (sunrise to sunset)'}; orange dots are blocked by terrain. {current.elevationDeg < 0 ? 'The Sun is below the horizon now, so it is not drawn.' : ''}
      </p>
    </div>
  );
}

function PowerGraph({ series, t0, t1, nowMs, onPick }: { series: ReturnType<typeof powerSeries>; t0: number | null; t1: number | null; nowMs: number; onPick: (ms: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2 || t0 === null || t1 === null) return null;
  const W = 300;
  const H = 96;
  const left = 30;
  const peak = Math.max(1e-9, ...series.map((s) => s.p.electricalW));
  const x = (t: number): number => scaleLinear(t, t0, t1, left, W - 4);
  const y = (w: number): number => scaleLinear(w, 0, peak, H - 14, 6);
  // Power between samples is linear (the same assumption the energy integral uses).
  const d = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.utcMs).toFixed(1)} ${y(s.p.electricalW).toFixed(1)}`).join(' ');
  const area = `${d} L ${x(t1).toFixed(1)} ${y(0)} L ${x(t0).toFixed(1)} ${y(0)} Z`;
  const nearest = hover === null ? null : series.reduce((a, b) => (Math.abs(b.utcMs - hover) < Math.abs(a.utcMs - hover) ? b : a));
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Electrical power over the analysed period"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(timeAtX(((e.clientX - r.left) / r.width) * W, left, W - 4, t0, t1));
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPick(Math.round(timeAtX(((e.clientX - r.left) / r.width) * W, left, W - 4, t0, t1)));
        }}
      >
        <line x1={left} x2={W - 4} y1={y(0)} y2={y(0)} stroke="#34506e" />
        <path d={area} fill="rgba(56,232,255,0.16)" />
        <path d={d} fill="none" stroke="#38e8ff" strokeWidth="1.4" />
        <text x="2" y="10" fontSize="7" fill="#7ea2c4">{fmtW(peak)}</text>
        <text x="2" y={y(0)} fontSize="7" fill="#7ea2c4">0 W</text>
        {nowMs >= t0 && nowMs <= t1 && <line x1={x(nowMs)} x2={x(nowMs)} y1="4" y2={y(0)} stroke="#ffd479" strokeDasharray="3 2" />}
        {nearest !== null && <circle cx={x(nearest.utcMs)} cy={y(nearest.p.electricalW)} r="3" fill="#fff" />}
        <text x={left} y={H - 2} fontSize="6.5" fill="#7ea2c4">{fmtUtc(t0).slice(5, 16)}</text>
        <text x={W - 4} y={H - 2} fontSize="6.5" fill="#7ea2c4" textAnchor="end">{fmtUtc(t1).slice(5, 16)}</text>
      </svg>
      <p className="sp-fine">
        {nearest !== null ? `${fmtUtc(nearest.utcMs)}: ${fmtW(nearest.p.electricalW)} (Sun ${nearest.elevationDeg.toFixed(1)}°)` : 'Electrical POWER (W) over the period; hover to inspect, click to move the clock there. Yellow dashes = current simulation time.'}
      </p>
    </div>
  );
}
