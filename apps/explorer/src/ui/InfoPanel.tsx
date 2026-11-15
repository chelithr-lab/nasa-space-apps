import type { UiSnapshot } from '../sim/simStore.ts';
import { IAU_MOON_FRAME_MODEL_NAME } from '../sim/lunarOrientation.ts';

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function deg(v: number, digits = 1): string {
  return `${v.toFixed(digits)}°`;
}

function latLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}° ${ns}, ${Math.abs(lon).toFixed(1)}° ${ew}`;
}

export function InfoPanel({ ui }: { ui: UiSnapshot }) {
  const snap = ui.snapshot;
  const iau = snap !== null && snap.moonFrame.model === IAU_MOON_FRAME_MODEL_NAME;
  return (
    <section className="info-panel" aria-label="Moon and geometry information">
      <h2>Selected-time information</h2>
      {snap === null ? (
        <p className="hint">No astronomical state is available yet.</p>
      ) : (
        <>
          <dl className="facts">
            <dt>Phase</dt>
            <dd>{snap.astro.phase.name} ({snap.astro.phase.waxing ? 'waxing' : 'waning'})</dd>
            <dt>Disk lit, seen from Earth</dt>
            <dd>{(snap.astro.phase.diskIlluminatedFraction * 100).toFixed(1)} %</dd>
            <dt>Sun–Earth–Moon elongation</dt>
            <dd>{deg(snap.astro.geometry.elongationDeg)}</dd>
            <dt>Phase angle (at the Moon)</dt>
            <dd>{deg(snap.astro.geometry.phaseAngleDeg)}</dd>
            <dt>Earth–Moon distance</dt>
            <dd>{nf0.format(snap.astro.moon.distanceKm)} km</dd>
            <dt>Earth–Sun distance</dt>
            <dd>{snap.astro.sun.distanceAu.toFixed(4)} AU</dd>
            <dt>Sub-solar point {!iau && <span className="approx">approx.</span>}</dt>
            <dd>{latLon(snap.lighting.subSolar.latDeg, snap.lighting.subSolar.lonDeg)}</dd>
            {iau ? (
              <>
                <dt>Sub-Earth point (libration)</dt>
                <dd>{latLon(snap.lighting.subEarth.latDeg, snap.lighting.subEarth.lonDeg)}</dd>
              </>
            ) : (
              <>
                <dt>Earth direction <span className="approx">approx.</span></dt>
                <dd>latitude {deg(snap.lighting.subEarth.latDeg)}, longitude 0° by construction</dd>
              </>
            )}
          </dl>
          <p className="hint">
            The whole Moon is always about half lit by the Sun. “Disk lit” is only the part facing Earth.
          </p>
          {snap.astro.warnings.length > 0 && (
            <ul className="warnings">
              {snap.astro.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </>
      )}

      <h3>What each item is</h3>
      <ul className="accuracy">
        <li><span className="lvl lvl2">Level 2</span> Moon and Sun positions, phase, distances: calculated from the astronomy library; checked against published tables at sampled dates only.</li>
        <li><span className="lvl lvl4">Level 4</span> Moon surface orientation, sub-solar point, Earth direction on the Moon: <strong>simplified</strong>. Ecliptic-pole frame, no longitudinal libration (up to about 8°), 1.5° axis tilt ignored.</li>
        <li><span className="lvl lvl4">Level 4</span> Earth grid orientation: real sidereal time, polar motion ignored.</li>
        <li><span className="lvl lvl4">Level 4</span> Terrain: NASA LRO LOLA LDEM_16 heights (about 1.9 km per pixel) displace the globe, drawn at the exaggeration shown in the status chip. East-west orientation of the data is not yet verified.</li>
        <li><span className="lvl lvl-none">Not built</span> Routes and scientific terrain-shadow calculations.</li>
      </ul>
      <p className="disclaimer">
        Educational visualisation. Not flight-certified and not suitable for navigation or operational mission decisions.
      </p>
    </section>
  );
}
