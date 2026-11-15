import { useEffect, useMemo, useState } from 'react';
import './styles/tokens.css';
import './styles/app.css';
import { SimStore } from './sim/simStore.ts';
import { computeSnapshotLive, moonKmLive, quartersLive } from './sim/liveCompute.ts';
import { InfoPanel } from './ui/InfoPanel.tsx';
import { MoonViewport } from './ui/MoonViewport.tsx';
import { OrbitPanel } from './ui/OrbitPanel.tsx';
import { EdgePanel } from './ui/EdgePanel.tsx';
import { SerenityMark } from './ui/SerenityMark.tsx';
import { TimeControls } from './ui/TimeControls.tsx';
import { useGlassGovernor } from './ui/useGlassGovernor.ts';
import { useRealClock, useSimUi } from './ui/hooks.ts';
import { SlotsContext } from './ui/slots.ts';
import type { SolarView } from './ui/SolarPanel.tsx';
import { nextLsiView } from './ui/lsiView.ts';
import './styles/themeBridge.css';
import './styles/immersive.css'; // last: it builds on the bridge

type Environment = 'moon' | 'earth';
/** Two ways of working in the Moon environment. They change layout only: never the scene, the clock or the camera. */
export type ViewMode = 'immersive' | 'analysis';

const MODE_NOTE: Readonly<Record<ViewMode, string>> = {
  immersive: 'Primary visual experience',
  analysis: 'Detailed scientific workspace',
};

export default function App() {
  // One shared store: one clock and one astronomical snapshot for BOTH views.
  const [store] = useState(
    () => new SimStore({ nowMs: () => Date.now(), computeSnapshot: computeSnapshotLive, quarters: quartersLive }),
  );
  const ui = useSimUi(store);
  const realNowMs = useRealClock();
  useGlassGovernor();
  // Both environments stay mounted: switching never touches the clock or the scenes.
  const [env, setEnv] = useState<Environment>('moon');
  const [mode, setMode] = useState<ViewMode>('immersive');
  // Layout of the Lunar Solar Intelligence panel. Its calculations and state live in SolarPanel and are never duplicated.
  const [lsi, setLsi] = useState<{ view: SolarView; before: SolarView }>({ view: 'expanded', before: 'expanded' });
  const setLsiView = (v: SolarView): void => setLsi((cur) => nextLsiView(cur, v));
  const analysis = env === 'moon' && mode === 'analysis';

  // Places other components render into (docked rails, technical-status area).
  const [dockLeft, setDockLeft] = useState<HTMLElement | null>(null);
  const [dockRight, setDockRight] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<HTMLElement | null>(null);
  const slots = useMemo(() => ({ dockLeft, dockRight, status }), [dockLeft, dockRight, status]);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  // Esc leaves the fullscreen LSI workspace and restores the layout it came from.
  useEffect(() => {
    if (lsi.view !== 'fullscreen') return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLsi((cur) => nextLsiView(cur, cur.before));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lsi.view]);

  return (
    <SlotsContext.Provider value={slots}>
      <div className="app sg" data-env={env} data-mode={mode} data-analysis={analysis} data-lsi={lsi.view}>
        <div className="sg-stage" data-stage="moon" data-active={env === 'moon'} aria-hidden={env !== 'moon'}>
          <MoonViewport store={store} active={env === 'moon'} analysis={analysis} lsiView={lsi.view} onLsiView={setLsiView} />
        </div>
        <div className="sg-stage" data-stage="earth" data-active={env === 'earth'} aria-hidden={env !== 'earth'}>
          <OrbitPanel store={store} moonKmAt={moonKmLive} active={env === 'earth'} />
        </div>

        <header className="sg-top">
          <SerenityMark />
          <div className="sg-env-row">
            <div className="sg-env" role="group" aria-label="Environment">
              <button type="button" aria-pressed={env === 'moon'} onClick={() => setEnv('moon')}>Moon</button>
              <button type="button" aria-pressed={env === 'earth'} onClick={() => setEnv('earth')}>Earth–Moon</button>
            </div>
            <div className="sg-env sg-modes" role="group" aria-label="Moon viewing mode" data-hidden={env !== 'moon'}>
              <button type="button" aria-pressed={mode === 'immersive'} onClick={() => setMode('immersive')} title={MODE_NOTE.immersive} tabIndex={env === 'moon' ? 0 : -1}>Immersive</button>
              <button type="button" aria-pressed={mode === 'analysis'} onClick={() => setMode('analysis')} title={MODE_NOTE.analysis} tabIndex={env === 'moon' ? 0 : -1}>Analysis</button>
            </div>
          </div>
          <p className="sg-mode-note" data-hidden={env !== 'moon'}>{MODE_NOTE[mode]}</p>
        </header>

        <div className="sg-frame" aria-hidden="true" />

        {/* Analysis mode rails. They are always in the page (so portals have a target) and shown only in Analysis. */}
        <aside className="dock dock-left lg-g2" data-on={analysis} ref={setDockLeft} aria-label="Analysis: information" />
        <aside className="dock dock-right lg-g2" data-on={analysis} ref={setDockRight} aria-label="Analysis: camera and layers" />

        <EdgePanel side="left" label="Info" handleTop="38%" width={380} dock={analysis} note>
          <InfoPanel ui={ui} />
          <div className="sg-status" ref={setStatus} />
        </EdgePanel>

        <footer className="sg-dock lg-g1">
          <TimeControls store={store} ui={ui} realNowMs={realNowMs} />
        </footer>
      </div>
    </SlotsContext.Provider>
  );
}
