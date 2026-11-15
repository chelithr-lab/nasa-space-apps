/**
 * Solar panel power and energy at a selected lunar site.
 *
 * A focused calculator, NOT an array-engineering simulator. The stages are kept
 * separate so they cannot be confused:
 *
 *   1. Solar irradiance at the Moon     S = S0 (1 AU / r)^2           [W/m2]
 *   2. Direct normal irradiance (DNI)   S, but 0 if the Sun is not directly
 *                                       visible (below the horizon, blocked by
 *                                       terrain, or fully eclipsed by Earth);
 *                                       reduced by the eclipse fraction      [W/m2]
 *   3. Panel incident irradiance        DNI x max(0, s_hat . n_hat)          [W/m2]
 *   4. Incident solar power             (3) x panel area                     [W]
 *   5. Electrical power                 (4) x efficiency x (1 - losses)      [W]
 *
 * s_hat is the unit vector from the site towards the Sun; n_hat is the PANEL
 * normal, which is independent of the terrain normal.
 *
 * S0 is the IAU 2015 Resolution B3 nominal total solar irradiance, 1361 W/m2 at
 * 1 au (a solar-cycle-23 mean; real irradiance varies by about +-0.1 percent
 * with the solar cycle, ignored here). The Moon has no atmosphere, so there is
 * no atmospheric loss term. NO reflected, scattered or thermal contribution is
 * added: "darkness" gives exactly 0 W.
 *
 * Panel "horizontal" means perpendicular to the local radial (up) direction,
 * the plane a level panel on a smooth sphere would lie in. It is not tilted to
 * follow the regional terrain slope, which the 1.9 km raster cannot give at the
 * scale of a panel. Panel mounting height is ignored: the panel sees the
 * ground-level horizon.
 */
import { dot, normalize, scale, vec3 } from '../astro/vec3.ts';
import type { Vec3 } from '../astro/vec3.ts';
import type { SiteFrame, SiteSolarState } from './solarSite.ts';

/** IAU 2015 Resolution B3 nominal total solar irradiance at 1 au, W/m2. */
export const SOLAR_IRRADIANCE_1AU_WM2 = 1361;

export type PanelMode = 'horizontal' | 'tilted' | 'tracking';

export const PANEL_MODE_LABEL: Readonly<Record<PanelMode, string>> = {
  horizontal: 'Horizontal (level)',
  tilted: 'Fixed tilt',
  tracking: 'Idealised Sun-tracking',
};

export interface PanelConfig {
  readonly mode: PanelMode;
  /** Total panel area, m2. */
  readonly areaM2: number;
  /** Cell conversion efficiency, percent (0..100). */
  readonly efficiencyPct: number;
  /** Overall system losses / derating, percent (0..100). */
  readonly lossesPct: number;
  /** Tilt from horizontal, degrees (0..90). Used only by 'tilted'. */
  readonly tiltDeg: number;
  /** Direction the panel faces, degrees clockwise from local north (0 = north, 90 = east). Used only by 'tilted'. */
  readonly azimuthDeg: number;
}

/**
 * EXAMPLE starting values so the calculator shows something. They are configurable
 * assumptions, NOT the specification of any real equipment.
 */
export const DEFAULT_PANEL: PanelConfig = {
  mode: 'horizontal',
  areaM2: 10,
  efficiencyPct: 25,
  lossesPct: 15,
  tiltDeg: 30,
  azimuthDeg: 0,
};

export function validatePanel(c: PanelConfig): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(c.areaM2) || c.areaM2 <= 0) problems.push('Panel area must be greater than 0 m2.');
  if (!Number.isFinite(c.efficiencyPct) || c.efficiencyPct <= 0 || c.efficiencyPct > 100) problems.push('Efficiency must be between 0 and 100 %.');
  if (!Number.isFinite(c.lossesPct) || c.lossesPct < 0 || c.lossesPct >= 100) problems.push('System losses must be at least 0 and below 100 %.');
  if (!Number.isFinite(c.tiltDeg) || c.tiltDeg < 0 || c.tiltDeg > 90) problems.push('Tilt must be between 0 and 90 degrees.');
  if (!Number.isFinite(c.azimuthDeg)) problems.push('Panel azimuth must be a number.');
  return problems;
}

/** System performance factor = 1 - losses/100. */
export function performanceFactor(c: PanelConfig): number {
  return 1 - c.lossesPct / 100;
}

/** Solar irradiance at the Moon from the actual Sun-Moon distance (inverse square), W/m2. */
export function solarIrradianceAtDistance(distanceAu: number, referenceWm2 = SOLAR_IRRADIANCE_1AU_WM2): number {
  if (!(distanceAu > 0)) throw new RangeError('The Sun distance must be greater than 0 au.');
  return referenceWm2 / (distanceAu * distanceAu);
}

/**
 * Panel normal in the Moon-fixed frame. For 'tracking' the panel is assumed to
 * face the Sun exactly (an idealisation, not a mechanism).
 */
export function panelNormal(c: PanelConfig, frame: SiteFrame, sunDirFixed: Vec3): Vec3 {
  if (c.mode === 'horizontal') return frame.up;
  if (c.mode === 'tracking') return normalize(sunDirFixed);
  const t = (c.tiltDeg * Math.PI) / 180;
  const a = (c.azimuthDeg * Math.PI) / 180;
  const horizontalFacing = vec3(
    frame.north.x * Math.cos(a) + frame.east.x * Math.sin(a),
    frame.north.y * Math.cos(a) + frame.east.y * Math.sin(a),
    frame.north.z * Math.cos(a) + frame.east.z * Math.sin(a),
  );
  const up = scale(frame.up, Math.cos(t));
  const h = scale(horizontalFacing, Math.sin(t));
  return normalize(vec3(up.x + h.x, up.y + h.y, up.z + h.z));
}

export interface PanelPower {
  /** (1) Solar irradiance at the Moon from the distance alone, W/m2. */
  solarIrradianceWm2: number;
  /** (2) Direct normal irradiance reaching the site (0 if the Sun is hidden), W/m2. */
  directNormalWm2: number;
  /** Signed s_hat . n_hat before clamping (negative = Sun behind the panel). */
  cosIncidenceSigned: number;
  /** (3) Panel incident irradiance, W/m2. */
  incidentWm2: number;
  /** (4) Incident solar power, W. */
  incidentW: number;
  /** (5) Electrical power, W. */
  electricalW: number;
  /** Why the output is zero, or null when power is being generated. */
  zeroReason: 'darkness' | 'terrain-shadow' | 'eclipse' | 'panel-faces-away' | null;
}

/** All five stages at one instant. Never invents power: a hidden Sun gives exactly 0. */
export function panelPower(state: SiteSolarState, frame: SiteFrame, config: PanelConfig): PanelPower {
  const solar = solarIrradianceAtDistance(state.sunDistanceAu);
  const n = panelNormal(config, frame, state.sunDirFixed);
  const cosSigned = dot(normalize(state.sunDirFixed), n);
  const dni = state.directSunlight ? solar * (1 - state.eclipseCovered) : 0;
  const cos = config.mode === 'tracking' ? (state.directSunlight ? 1 : 0) : Math.max(0, cosSigned);
  const incidentWm2 = dni * cos;
  const incidentW = incidentWm2 * config.areaM2;
  const electricalW = incidentW * (config.efficiencyPct / 100) * performanceFactor(config);
  let zeroReason: PanelPower['zeroReason'] = null;
  if (electricalW <= 0) {
    if (!state.geometricSunUp) zeroReason = 'darkness';
    else if (state.terrainBlocked) zeroReason = 'terrain-shadow';
    else if (state.eclipseCovered >= 1) zeroReason = 'eclipse';
    else zeroReason = 'panel-faces-away';
  }
  return { solarIrradianceWm2: solar, directNormalWm2: dni, cosIncidenceSigned: cosSigned, incidentWm2, incidentW, electricalW, zeroReason };
}

// -------------------------------------------------------------------- energy

export interface EnergyResult {
  /** Total electrical energy over the interval, watt-hours. */
  energyWh: number;
  /** Interval length, seconds. */
  durationS: number;
  averageW: number;
  peakW: number;
  /** Lowest sampled power, W (usually 0). */
  minW: number;
  /** Seconds with electrical power above zero. */
  generatingS: number;
  /** Seconds with exactly zero electrical power. */
  zeroS: number;
  sampleCount: number;
}

/**
 * Energy = integral of electrical power over time, from time-ordered site
 * states (see solarScan.ts, which puts extra samples within about a second of
 * every sunrise, sunset and terrain-shadow edge).
 *
 * Between samples power is treated as linear (trapezoid rule). Where a fixed
 * panel stops facing the Sun between two samples, the crossing is located from
 * the signed cosine of the incidence angle (which is nearly linear over minutes)
 * and only the generating part is integrated.
 */
export function integratePower(states: readonly SiteSolarState[], frame: SiteFrame, config: PanelConfig): EnergyResult {
  const n = states.length;
  if (n < 2) throw new RangeError('At least two samples are needed to integrate power.');
  const first = states[0] as SiteSolarState;
  const last = states[n - 1] as SiteSolarState;
  const durationS = (last.utcMs - first.utcMs) / 1000;

  const pw: PanelPower[] = states.map((s) => panelPower(s, frame, config));
  let energyWs = 0;
  let generatingS = 0;
  let peak = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const p of pw) {
    if (p.electricalW > peak) peak = p.electricalW;
    if (p.electricalW < min) min = p.electricalW;
  }

  for (let i = 0; i < n - 1; i++) {
    const a = states[i] as SiteSolarState;
    const b = states[i + 1] as SiteSolarState;
    const pa = pw[i] as PanelPower;
    const pb = pw[i + 1] as PanelPower;
    const dt = (b.utcMs - a.utcMs) / 1000;
    if (!(dt > 0)) continue;

    // A fixed panel turning away between two lit samples: integrate only the facing part.
    const bothLit = a.directSunlight && b.directSunlight;
    if (bothLit && config.mode !== 'tracking' && (pa.cosIncidenceSigned > 0) !== (pb.cosIncidenceSigned > 0)) {
      const ca = pa.cosIncidenceSigned;
      const cb = pb.cosIncidenceSigned;
      const tCross = ca / (ca - cb); // fraction of dt where the cosine is 0
      if (ca > 0) {
        energyWs += 0.5 * pa.electricalW * tCross * dt;
        generatingS += tCross * dt;
      } else {
        energyWs += 0.5 * pb.electricalW * (1 - tCross) * dt;
        generatingS += (1 - tCross) * dt;
      }
      continue;
    }

    energyWs += 0.5 * (pa.electricalW + pb.electricalW) * dt;
    if (pa.electricalW > 0 && pb.electricalW > 0) generatingS += dt;
    else if (pa.electricalW > 0 || pb.electricalW > 0) generatingS += dt / 2;
  }

  return {
    energyWh: energyWs / 3600,
    durationS,
    averageW: durationS > 0 ? energyWs / durationS : 0,
    peakW: peak,
    minW: Number.isFinite(min) ? min : 0,
    generatingS,
    zeroS: Math.max(0, durationS - generatingS),
    sampleCount: n,
  };
}

/** Time series of every stage, for the graph. */
export function powerSeries(states: readonly SiteSolarState[], frame: SiteFrame, config: PanelConfig): Array<{ utcMs: number; elevationDeg: number; p: PanelPower }> {
  return states.map((s) => ({ utcMs: s.utcMs, elevationDeg: s.elevationDeg, p: panelPower(s, frame, config) }));
}

export function formatEnergy(wh: number): string {
  const a = Math.abs(wh);
  if (a >= 1000) return `${(wh / 1000).toFixed(a >= 100_000 ? 0 : a >= 10_000 ? 1 : 2)} kWh`;
  return `${wh.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)} Wh`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
