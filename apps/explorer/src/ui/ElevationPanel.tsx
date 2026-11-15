import {
  BANDING_LABEL,
  PALETTE_LABEL,
  RANGE_LABEL,
  describeScale,
  formatKm,
  legendGradientCss,
  legendPosition,
  legendTicks,
} from '../sim/elevationColour.ts';
import type { BandingId, ElevationSettings, PaletteId, RangeId } from '../sim/elevationColour.ts';
import type { ElevationInfo } from '../render/moonScene.ts';
import type { TerrainStatus } from '../sim/terrainConfig.ts';

/**
 * Legend and controls for Elevation mode. Everything shown is computed from the same numbers that
 * colour the Moon (elevationColour.ts), so the legend cannot disagree with the surface.
 * It sits in the existing bottom-right panel and uses only scoped `.elv` styles.
 */

const CSS = `
.app .elv{display:flex;flex-direction:column;gap:6px;max-width:240px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--line,#1f2c47);font-size:.74rem;line-height:1.35}
.app .elv .elv-kicker{font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:#7ea2c4}
.app .elv .elv-title{margin:0;font-size:.78rem;font-weight:600;color:var(--text,#e6edf7)}
.app .elv .elv-hist{position:relative;height:26px}
.app .elv .elv-hist i{position:absolute;bottom:0;background:rgba(160,190,220,.45);border-radius:1px 1px 0 0}
.app .elv .elv-bar{position:relative;height:14px;border-radius:3px;border:1px solid rgba(160,190,220,.35)}
.app .elv .elv-pin{position:absolute;top:-6px;width:0;height:0;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #fff;filter:drop-shadow(0 0 2px #000)}
.app .elv .elv-ticks{position:relative;height:26px}
.app .elv .elv-ticks span{position:absolute;top:0;transform:translateX(-50%);text-align:center;white-space:nowrap;color:var(--muted,#92a1b8);font-variant-numeric:tabular-nums}
.app .elv .elv-ticks span::before{content:"";display:block;width:1px;height:4px;margin:0 auto 1px;background:rgba(160,190,220,.6)}
.app .elv .elv-ticks span:first-child{transform:translateX(0);text-align:left}
.app .elv .elv-ticks span:first-child::before{margin-left:0}
.app .elv .elv-ticks span:last-child{transform:translateX(-100%);text-align:right}
.app .elv .elv-ticks span:last-child::before{margin-right:0}
.app .elv .elv-datum{margin:0;color:var(--muted,#92a1b8)}
.app .elv .elv-clip{margin:0;color:#f2b84b}
.app .elv label{display:flex;flex-direction:column;gap:2px;color:var(--muted,#92a1b8)}
.app .elv select{width:100%}
.app .elv .elv-check{flex-direction:row;align-items:flex-start;gap:6px}
.app .elv .elv-warn{margin:0;color:#ff9f6b}
.app .elv details{color:var(--muted,#92a1b8)}
.app .elv summary{cursor:pointer}
.app .elv details ul{margin:4px 0 0;padding-left:16px}
.app .elv details li{margin:3px 0}
`;

export interface ElevationPanelProps {
  readonly terrain: TerrainStatus;
  readonly info: ElevationInfo | null;
  readonly settings: ElevationSettings;
  readonly onChange: (settings: ElevationSettings) => void;
  /** Un-exaggerated height under the pointer, metres, or null. */
  readonly pointerHeightMetres: number | null;
}

const LIMITS: readonly string[] = [
  'The data are LRO LOLA LDEM_16 cells, about 1.9 km across, each an area mean. Craters, rims and ridges narrower than a few cells are smoothed, and the extremes shown are cell means (published point values, e.g. +10,786 m for the highest point, differ).',
  'Heights are above a reference sphere of radius 1737.4 km. The Moon has no sea level and this is not a geoid, so “0 km” is a convention, not a geological level.',
  'No vertical accuracy for LDEM_16 cells was found in the sources read, so no uncertainty is shown. Where LOLA tracks are sparse the grid is interpolated (the count maps that flag this are not loaded).',
  'The geographic orientation of the elevation file has only been compared with published landmarks (docs/ORIENTATION_VERIFICATION.md). Treat positions as unverified until you have run scripts/check-orientation.ts.',
  'The relief you see is drawn exaggerated for visibility (see the Terrain chip). The colours always use the true heights.',
];

export function ElevationPanel({ terrain, info, settings, onChange, pointerHeightMetres }: ElevationPanelProps) {
  if (terrain.state === 'loading') {
    return (
      <div className="elv" role="status">
        <style>{CSS}</style>
        <span className="elv-kicker">Elevation</span>
        <p className="elv-datum">Waiting for the elevation data to load. The Moon stays in its Normal appearance until it has.</p>
      </div>
    );
  }
  if (terrain.state === 'unavailable' || info === null) {
    const reason = terrain.state === 'unavailable' ? terrain.reason : 'The colours could not be prepared.';
    return (
      <div className="elv" role="status">
        <style>{CSS}</style>
        <span className="elv-kicker">Elevation</span>
        <p className="elv-warn">Elevation colours are unavailable, so the Moon is shown in its Normal appearance. No elevation values are displayed.</p>
        <p className="elv-datum">{reason}</p>
      </div>
    );
  }

  const { stats, range } = info;
  const ticks = legendTicks(range);
  const pin = pointerHeightMetres === null ? null : legendPosition(pointerHeightMetres, range);
  const maxBin = Math.max(...stats.histogram, 1e-9);
  const binSpan = (stats.maxMetres - stats.minMetres) / stats.histogram.length;
  const set = (patch: Partial<ElevationSettings>): void => onChange({ ...settings, ...patch });

  return (
    <div className="elv" role="group" aria-label="Elevation legend and controls">
      <style>{CSS}</style>
      <span className="elv-kicker">Elevation</span>
      <p className="elv-title">Height above the 1737.4 km reference sphere</p>

      <div className="elv-hist" aria-hidden="true" title="Share of the Moon's surface at each height (area-weighted)">
        {stats.histogram.map((fraction, i) => {
          const lo = legendPosition(stats.minMetres + i * binSpan, range).fraction;
          const hi = legendPosition(stats.minMetres + (i + 1) * binSpan, range).fraction;
          if (hi <= lo) return null;
          return <i key={i} style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, height: `${Math.max(1, (fraction / maxBin) * 26)}px` }} />;
        })}
      </div>
      <div className="elv-bar" style={{ background: legendGradientCss(settings, range) }} role="img" aria-label={`Colour scale from ${formatKm(range.loMetres)} to ${formatKm(range.hiMetres)}`}>
        {pin !== null && <span className="elv-pin" style={{ left: `${pin.fraction * 100}%` }} title="Height under the pointer" />}
      </div>
      <div className="elv-ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${legendPosition(t, range).fraction * 100}%` }}>
            {formatKm(t)}
          </span>
        ))}
      </div>
      {range.clipsData && (
        <p className="elv-clip">
          Clipped: below {formatKm(range.loMetres)} and above {formatKm(range.hiMetres)} take the end colours (data run {formatKm(stats.minMetres)} to {formatKm(stats.maxMetres)}).
        </p>
      )}
      {pin !== null && pin.clipped !== null && (
        <p className="elv-clip">The pointer is {pin.clipped} the displayed range.</p>
      )}

      <label>
        Colour scale
        <select value={settings.palette} onChange={(e) => set({ palette: e.target.value as PaletteId })}>
          {(Object.keys(PALETTE_LABEL) as PaletteId[]).map((id) => (
            <option key={id} value={id}>{PALETTE_LABEL[id]}</option>
          ))}
        </select>
      </label>
      <label>
        Elevation range
        <select value={settings.range} onChange={(e) => set({ range: e.target.value as RangeId })}>
          {(Object.keys(RANGE_LABEL) as RangeId[]).map((id) => (
            <option key={id} value={id}>{RANGE_LABEL[id]}</option>
          ))}
        </select>
      </label>
      <label>
        Steps
        <select value={settings.banding} onChange={(e) => set({ banding: e.target.value as BandingId })}>
          {(Object.keys(BANDING_LABEL) as BandingId[]).map((id) => (
            <option key={id} value={id}>{BANDING_LABEL[id]}</option>
          ))}
        </select>
      </label>
      <label className="elv-check">
        <input type="checkbox" checked={settings.sunShading} onChange={(e) => set({ sunShading: e.target.checked })} />
        <span>Add Sun lighting</span>
      </label>
      {settings.sunShading && (
        <p className="elv-warn">Lighting is on: brightness now also reflects sunlight and the dark side, not only height. Read heights from the colour hue and the legend.</p>
      )}

      <details>
        <summary>About this scale and its limits</summary>
        <p className="elv-datum" style={{ marginTop: 6 }}>{describeScale(settings, range, stats)}</p>
        <ul>
          {LIMITS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
