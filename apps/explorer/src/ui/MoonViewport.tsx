import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MoonCameraPreset } from '../sim/cameraPresets.ts';
import type { SimStore } from '../sim/simStore.ts';
import { MoonScene } from '../render/moonScene.ts';
import type { ElevationInfo, MoonDisplay, MoonLayers, SiteClick } from '../render/moonScene.ts';
import type { LandingSite } from '../sim/landingSites.ts';
import { findMission } from '../sim/missionCatalogue.ts';
import type { MoonTextureInfo } from '../render/textures.ts';
import { describeTerrainStatus } from '../sim/terrainConfig.ts';
import { READOUT_PROMPT, formatReadout } from '../sim/pointReadout.ts';
import type { PointReadout } from '../sim/pointReadout.ts';
import type { TerrainStatus } from '../sim/terrainConfig.ts';
import { MissionDossier } from './MissionDossier.tsx';
import { EdgePanel } from './EdgePanel.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ElevationPanel } from './ElevationPanel.tsx';
import { SolarPanel } from './SolarPanel.tsx';
import type { SolarView } from './SolarPanel.tsx';
import { SlotsContext } from './slots.ts';
import { DEFAULT_ELEVATION_SETTINGS } from '../sim/elevationColour.ts';
import type { ElevationSettings } from '../sim/elevationColour.ts';
import { useModeState } from './useModeState.ts';
import { createModeStore } from '../modes/modeStore.ts';
import { modeView } from '../modes/visualisationModes.ts';

const PRESETS: ReadonlyArray<{ id: MoonCameraPreset; label: string }> = [
  { id: 'nearSide', label: 'Near side' },
  { id: 'farSide', label: 'Far side' },
  { id: 'northPole', label: 'North pole' },
  { id: 'southPole', label: 'South pole' },
];

interface MoonViewportProps {
  store: SimStore;
  /** False while the Earth-Moon environment is showing. */
  active?: boolean;
  /** Analysis mode docks the Camera and Layers panels in the right rail; Immersive keeps them on edge tabs. */
  analysis?: boolean;
  /** Layout of the Lunar Solar Intelligence panel. Owned by App so it survives mode changes. */
  lsiView?: SolarView;
  onLsiView?: ((v: SolarView) => void) | undefined;
}

export function MoonViewport({ store, active = true, analysis = false, lsiView = 'expanded', onLsiView }: MoonViewportProps) {
  const slots = useContext(SlotsContext);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MoonScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texture, setTexture] = useState<MoonTextureInfo | null>(null);
  const [readout, setReadout] = useState<PointReadout | null>(null);
  const [elevationInfo, setElevationInfo] = useState<ElevationInfo | null>(null);
  const [elevationSettings, setElevationSettings] = useState<ElevationSettings>(DEFAULT_ELEVATION_SETTINGS);
  // Illumination mode: the ONE selected site (set by clicking the Moon), shared by every solar feature.
  const [selectedSite, setSelectedSite] = useState<SiteClick | null>(null);
  const [lsiOpen, setLsiOpen] = useState(false);
  const [terrain, setTerrain] = useState<TerrainStatus>({ state: 'loading' });
  const [preset, setPreset] = useState<MoonCameraPreset>('nearSide');
  // The id of the mission whose dossier is open (the landing-site id is the catalogue mission id).
  const [openMissionId, setOpenMissionId] = useState<string | null>(null);
  const [layers, setLayers] = useState<MoonLayers>({
    graticule: true,
    markers: true,
    landingSites: true,
  });
  const [display, setDisplay] = useState<MoonDisplay>({ brightness: 1, darkSide: 0.06 });
  // Visualisation mode (Normal by default). It holds only the active mode: camera, clock and the open dossier are untouched by it.
  const [modeStore] = useState(() => createModeStore());
  const currentMode = modeView(useModeState(modeStore).active);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let scene: MoonScene;
    try {
      // A marker click gives us the landing site; its id is the mission id in the catalogue.
      const onSiteSelected = (site: LandingSite): void => setOpenMissionId(site.id);
      scene = new MoonScene(host, setTexture, onSiteSelected, setTerrain, setReadout, setElevationInfo, setSelectedSite);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTerrain({ state: 'unavailable', reason: 'The 3D Moon could not start, so no terrain is shown.' });
      return;
    }
    sceneRef.current = scene;
    const unsubscribe = store.subscribeFrame((frame) => scene.update(frame));
    return () => {
      unsubscribe();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [store]);

  // The other environment is showing: stop drawing, keep the scene (nothing is rebuilt on return).
  useEffect(() => {
    sceneRef.current?.setPaused(!active);
  }, [active]);

  useEffect(() => {
    sceneRef.current?.setLayers(layers);
    // Hiding the landing-site layer closes the dossier (as before).
    if (!layers.landingSites) setOpenMissionId(null);
  }, [layers]);

  useEffect(() => {
    sceneRef.current?.setDisplay(display);
  }, [display]);

  // Visualisation mode: only the Moon's material changes (never the camera, clock, mission or terrain).
  // Any mode that is not implemented is drawn as Normal, exactly as the selector says.
  const sceneMode = currentMode.id === 'elevation' ? 'elevation' : 'normal';
  useEffect(() => {
    sceneRef.current?.setVisualisationMode(sceneMode);
  }, [sceneMode, store]);

  useEffect(() => {
    sceneRef.current?.setElevationSettings(elevationSettings);
  }, [elevationSettings, store]);

    // LSI owns site selection independently of visualisation mode.
  useEffect(() => {
    sceneRef.current?.setSiteSelectionEnabled(lsiOpen && selectedSite === null);
  }, [lsiOpen, selectedSite]);

  useEffect(() => {
    sceneRef.current?.setSelectedSite(selectedSite);
  }, [selectedSite]);
  // The raster the terrain mesh was built from, once it is loaded.
  const raster = useMemo(() => (terrain.state === 'active' ? sceneRef.current?.getElevationRaster() ?? null : null), [terrain.state]);


  const choose = (p: MoonCameraPreset): void => {
    setPreset(p);
    sceneRef.current?.setCameraPreset(p);
  };

  const closeDossier = useCallback((): void => setOpenMissionId(null), []);
  const mission = openMissionId !== null ? findMission(openMissionId) : undefined;

  return (
    <div className="viewport-wrap primary-view">
      <div ref={hostRef} className="viewport" role="img" aria-label="Interactive 3D globe of the Moon. Drag to rotate, scroll or pinch to zoom." />

      {error !== null && (
        <div className="viewport-error" role="alert">
          <strong>The 3D Moon could not start.</strong>
          <p>{error}</p>
          <p>This app needs WebGL. Try a current version of Chrome, Edge or Firefox with hardware acceleration turned on.</p>
        </div>
      )}

      <EdgePanel side="right" label="Camera" handleTop="30%" width={240} dock={analysis}>
        <div className="ep-col" role="group" aria-label="Camera presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => choose(p.id)}>{p.label}</button>
          ))}
          <button type="button" onClick={() => choose('nearSide')} title="Return to the near-side view">Reset view</button>
        </div>
      </EdgePanel>

            <div className="overlay overlay-lsi-launch">
        <button
          type="button"
          onClick={() => {
            if (!lsiOpen) {
              setLsiOpen(true);
            } else if (selectedSite !== null) {
              setSelectedSite(null);
            } else {
              setLsiOpen(false);
            }
          }}
        >
          {!lsiOpen
            ? 'Open Lunar Solar Intelligence'
            : selectedSite !== null
              ? 'Change analysis site'
              : 'Close Lunar Solar Intelligence'}
        </button>
      </div>

      {lsiOpen && selectedSite === null && (
        <div className="overlay overlay-top-left overlay-hint2" role="status">
          <p className="hint">Select any point on the lunar surface to analyse it.</p>
        </div>
      )}

      {lsiOpen && selectedSite !== null && (
        <SolarPanel
          store={store}
          selected={selectedSite}
          raster={raster}
          onClose={() => {
            setLsiOpen(false);
            setSelectedSite(null);
          }}
          view={lsiView}
          onViewChange={onLsiView}
        />
      )}

      {mission !== undefined && <MissionDossier key={mission.id} mission={mission} onClose={closeDossier} />}

      {slots.status !== null && active &&
        createPortal(
          <div className="sg-status-block">
            <h3 className="dock-head">Display and data status</h3>
        <div className="chips chips-col">
          <span className="chip chip-warn" title="The Moon-fixed orientation is a simplification: it ignores libration (up to about 8 degrees of longitude) and the 1.5 degree axis tilt.">
            Orientation: APPROXIMATE
          </span>
          {texture !== null && (
            <span className={texture.kind === 'procedural' ? 'chip chip-warn' : 'chip'} title={texture.detail}>
              {texture.title}
            </span>
          )}
          {(() => {
            const t = describeTerrainStatus(terrain);
            return (
              <span className={t.tone === 'warn' ? 'chip chip-warn' : 'chip'} title={t.title} role="status">
                {t.label}
              </span>
            );
          })()}
          {currentMode.id === 'elevation' && elevationInfo !== null && (
            <span className="chip" title="In Elevation mode the colours come from the LOLA height data only, not from photographs or lighting.">Colours = elevation, not imagery</span>
          )}
          <span className="chip" title="Any shadows drawn on the Moon come from the renderer and are a display aid only. No scientific shadow or permanently-shadowed-region calculation exists yet.">Shadows: display only</span>
          {currentMode.chip !== undefined && (
            <span className="chip chip-warn" title={currentMode.notice}>
              {currentMode.chip}
            </span>
          )}
        </div>
          </div>,
          slots.status,
        )}

      <div className="overlay overlay-bottom-right">
        {(() => {
          const text = readout === null ? null : formatReadout(readout, terrain.state === 'active' ? terrain.exaggeration : 1);
          return (
            <div className="sg-readout lg-g1" title={text?.title} role="status" aria-live="off">
              <div className="sg-readout-label">Surface point</div>
              {text === null ? (
                <div className="hint">{READOUT_PROMPT}</div>
              ) : (
                <>
                  <div>{text.position}</div>
                  <div>{text.height}</div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      <EdgePanel side="right" label="Layers" handleTop="46%" width={320} dock={analysis}>
      <div className="ep-col">
        <ModeSelector mode={currentMode.id} onChange={(m) => modeStore.select(m)} />
        {currentMode.id === 'elevation' && (
          <ElevationPanel
            terrain={terrain}
            info={elevationInfo}
            settings={elevationSettings}
            onChange={setElevationSettings}
            pointerHeightMetres={readout === null ? null : readout.heightMetres}
          />
        )}
        <label className="check">
          <input type="checkbox" checked={layers.graticule} onChange={(e) => setLayers({ ...layers, graticule: e.target.checked })} /> Lat/lon grid
        </label>
        <label className="check">
          <input type="checkbox" checked={layers.markers} onChange={(e) => setLayers({ ...layers, markers: e.target.checked })} /> Sun / Earth markers
        </label>
        <label className="check">
          <input type="checkbox" checked={layers.landingSites} onChange={(e) => setLayers({ ...layers, landingSites: e.target.checked })} /> Lunar landing sites
        </label>
        <label className="slider">
          Brightness
          <input type="range" min={0.4} max={2} step={0.05} value={display.brightness} onChange={(e) => setDisplay({ ...display, brightness: Number(e.target.value) })} />
        </label>
        <label className="slider">
          Dark-side visibility
          <input type="range" min={0} max={0.3} step={0.01} value={display.darkSide} onChange={(e) => setDisplay({ ...display, darkSide: Number(e.target.value) })} />
        </label>
        <p className="hint">Brightness and dark-side visibility are display aids only.</p>
      </div>
      </EdgePanel>
    </div>
  );
}
