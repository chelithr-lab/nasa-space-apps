import { useEffect, useRef, useState } from 'react';
import type { OrbitCameraPreset } from '../sim/cameraPresets.ts';
import type { SimStore } from '../sim/simStore.ts';
import { OrbitScene } from '../render/orbitScene.ts';
import { EdgePanel } from './EdgePanel.tsx';

interface Props {
  store: SimStore;
  moonKmAt: (utcMs: number) => { x: number; y: number; z: number } | null;
  /** False while the Moon environment is showing: the scene stops drawing but is kept. */
  active?: boolean;
}

export function OrbitPanel({ store, moonKmAt, active = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbitScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<OrbitCameraPreset>('northPolar');

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let scene: OrbitScene;
    try {
      scene = new OrbitScene(host, moonKmAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    sceneRef.current = scene;
    const unsubscribe = store.subscribeFrame((frame) => scene.update(frame));
    return () => {
      unsubscribe();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [store, moonKmAt]);

  useEffect(() => {
    sceneRef.current?.setPaused(!active);
  }, [active]);

  const choose = (p: OrbitCameraPreset): void => {
    setPreset(p);
    sceneRef.current?.setCameraPreset(p);
  };

  return (
    <section className="orbit-stage" aria-label="Earth-centred orbital view">
      <div className="viewport-wrap orbit-view">
        <div ref={hostRef} className="viewport" role="img" aria-label="Earth-centred view of the Moon's position, the Moon's computed path and the Sun's direction." />
        {error !== null && (
          <div className="viewport-error" role="alert"><strong>Orbit view could not start.</strong><p>{error}</p></div>
        )}

        <EdgePanel side="right" label="Camera" handleTop="30%" width={220}>
          <div className="ep-col" role="group" aria-label="Orbit camera presets">
            <button type="button" aria-pressed={preset === 'northPolar'} onClick={() => choose('northPolar')}>North-polar</button>
            <button type="button" aria-pressed={preset === 'oblique'} onClick={() => choose('oblique')}>Oblique</button>
          </div>
        </EdgePanel>

        <EdgePanel side="right" label="Scale" handleTop="46%" width={340}>
          <div className="ep-col">
            <p className="legend">
              <span>Distances, rings (every 100,000 km) and the Moon's path: <strong>to scale</strong>.</span>{' '}
              <span>Earth and Moon: drawn <strong>8× too large</strong>.</span>{' '}
              <span>Sun: <strong>direction only</strong> (about 389× farther than the Moon).</span>{' '}
              <span>North-polar view looks down the celestial north axis; the Moon's path is computed from the ephemeris, not an idealised orbit.</span>
            </p>
          </div>
        </EdgePanel>

        <div className="overlay overlay-bottom-left">
          <div className="chips">
            <span className="chip">Distances: to scale</span>
            <span className="chip chip-warn">Earth and Moon: 8× too large</span>
            <span className="chip chip-warn">Sun: direction only</span>
          </div>
        </div>
      </div>
    </section>
  );
}
