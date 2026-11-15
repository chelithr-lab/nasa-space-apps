/**
 * PRIMARY VIEW: the Moon-centred 3D lunar globe.
 *
 * Scene units: 1 = the lunar reference radius (1737.4 km). The Moon never
 * rotates in this scene: it sits in the (approximate) Moon-fixed frame, and
 * the SUN direction moves around it as simulation time changes. A camera
 * move therefore cannot change anything astronomical.
 *
 * Lighting is Lambert (diffuse) shading with one directional light. The real
 * lunar surface is not Lambertian. The globe is displaced by real LOLA terrain; any
 * shadows drawn by the renderer are a display aid, not a scientific shadow calculation. The dark side is lifted by a small display-only
 * ambient term (not real earthshine).
 *
 * `overlayGroup` is the place where later stages attach verified surface
 * markers, routes and terrain. Anything added to it uses Moon-fixed
 * coordinates through toScene(latLonToUnit(lat, lon)).
 */
import * as THREE from 'three';
import { buildGraticule } from '../sim/graticule.ts';
import { moonCameraPose } from '../sim/cameraPresets.ts';
import type { MoonCameraPreset } from '../sim/cameraPresets.ts';
import { segmentHitsSphere } from '../sim/occlusion.ts';
import { latLonToUnit, toScene } from '../sim/sceneMapping.ts';
import { LANDING_SITES } from '../sim/landingSites.ts';
import type { LandingSite } from '../sim/landingSites.ts';
import { createLandingSiteMarkers } from './landingSiteMarkers.ts';
import type { FrameData } from '../sim/simStore.ts';
import { buildLatLonSphere } from '../sim/sphereMesh.ts';
import { buildTerrainMesh } from '../sim/lunarElevation.ts';
import type { ElevationRaster } from '../sim/lunarElevation.ts';
import {
  DEFAULT_ELEVATION_SETTINGS,
  ELEVATION_TEXTURE_HEIGHT,
  ELEVATION_TEXTURE_WIDTH,
  bakeRgba,
  buildColourLut,
  computeElevationStats,
  displayRange,
  resampleMeanCounts,
} from '../sim/elevationColour.ts';
import type { DisplayRange, ElevationSettings, ElevationStats } from '../sim/elevationColour.ts';
import { readoutAtScenePoint, sceneDirectionToLatLon } from '../sim/pointReadout.ts';
import type { PointReadout } from '../sim/pointReadout.ts';
import {
  TERRAIN_MESH_LAT_SEGMENTS,
  TERRAIN_MESH_LON_SEGMENTS,
  exaggerationFromSearch,
  footprintForApp,
} from '../sim/terrainConfig.ts';
import type { TerrainStatus } from '../sim/terrainConfig.ts';
import { SceneHost } from './sceneHost.ts';
import { NASA_INFO, PROCEDURAL_INFO, createProceduralMoonTexture, loadNasaMoonTexture, loadNasaMoonElevation } from './textures.ts';
import type { MoonTextureInfo } from './textures.ts';

/** A surface point chosen by clicking the Moon in Illumination mode. Longitude is 0 exactly at a pole (where it is undefined). */
export interface SiteClick {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export interface MoonLayers {
  graticule: boolean;
  markers: boolean;
  landingSites: boolean;
}

/** What the Elevation legend needs: the data statistics and the display range currently drawn. */
export interface ElevationInfo {
  readonly stats: ElevationStats;
  readonly range: DisplayRange;
}

/** Visual modes the scene can draw. Only these two exist; any other mode is drawn as 'normal'. */
export type SceneVisualMode = 'normal' | 'elevation';

export interface MoonDisplay {
  /** Multiplier on the Sun light (display only). */
  brightness: number;
  /** 0..0.3: ambient light that lifts the dark side so it stays visible (display only). */
  darkSide: number;
}

const CAMERA_DISTANCE = 4.2;
const SUN_LIGHT_DISTANCE = 30;
const CLICK_DRAG_THRESHOLD_PX = 6;

export class MoonScene {
  private readonly host: SceneHost;
  private readonly moonMaterial: THREE.MeshStandardMaterial;
  private readonly moonMesh: THREE.Mesh;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly graticuleGroup = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private readonly sunArrow: THREE.ArrowHelper;
  private readonly earthArrow: THREE.ArrowHelper;
  private readonly subSolarDot: THREE.Mesh;
  private readonly subEarthDot: THREE.Mesh;
  /** Landing sites are attached here so their visibility can be toggled as a layer. */
  readonly overlayGroup = new THREE.Group();
  private readonly landingSiteMarkers = createLandingSiteMarkers(LANDING_SITES);
  private readonly raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number } | null = null;
private readonly onLandingSiteSelect: (site: LandingSite) => void;
  private readonly onPointerReadout: (readout: PointReadout | null) => void;
  private readonly onSiteClick: (site: SiteClick) => void;
  /** True only in Illumination mode: a click on the bare surface then selects a site. */
  private siteSelectionEnabled = false;
  private selectedSiteMarker: THREE.Mesh | null = null;
  /** The decoded elevation raster, kept (not copied) so the readout can sample it. null until terrain has loaded. */
  private elevation: ElevationRaster | null = null;
  private pendingMove: PointerEvent | null = null;
  private readonly onElevationInfo: (info: ElevationInfo | null) => void;
  private visualMode: SceneVisualMode = 'normal';
  private elevationSettings: ElevationSettings = DEFAULT_ELEVATION_SETTINGS;
  /** Built on first use of Elevation mode, then reused: statistics, averaged counts, colour bytes, texture. */
  private elevationData: {
    stats: ElevationStats;
    mean: Uint16Array;
    rgba: Uint8Array;
    texture: THREE.DataTexture;
  } | null = null;
  private elevationFlat: THREE.MeshBasicMaterial | null = null;
  private elevationLit: THREE.MeshStandardMaterial | null = null;
  private moveFrame = 0;

  private readonly sunDir = new THREE.Vector3(1, 0, 0);
  private readonly earthDir = new THREE.Vector3(1, 0, 0);
  private readonly tmpWorld = new THREE.Vector3();
  private readonly origin = { x: 0, y: 0, z: 0 };
  private display: MoonDisplay = { brightness: 1, darkSide: 0.06 };
  private layers: MoonLayers = {
    graticule: true,
    markers: true,
    landingSites: true,
  };
  private lastFrame: FrameData | null = null;
  private disposed = false;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      this.pointerDown = null;
      return;
    }
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (start === null || event.button !== 0 || (!this.layers.landingSites && !this.siteSelectionEnabled)) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_PX * CLICK_DRAG_THRESHOLD_PX) return;

    const canvas = this.host.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.host.camera);

    const markerObjects = this.layers.landingSites ? this.landingSiteMarkers.map((marker) => marker.object) : [];
    const markerHits = this.raycaster.intersectObjects(markerObjects, false);
    if (markerHits.length === 0) {
      this.pickSite();
      return;
    }

    const firstMarkerHit = markerHits[0];
    if (!firstMarkerHit) return;
    const moonHits = this.raycaster.intersectObject(this.moonMesh, false);
    const firstMoonHit = moonHits[0];

    // A marker is selectable only if it is in front of the lunar surface.
    // If the Moon surface is hit first, the marker is on the far side or occluded.
    if (firstMoonHit && firstMoonHit.distance <= firstMarkerHit.distance) {
      this.pickSite();
      return;
    }

    const site = firstMarkerHit.object.userData.landingSite as LandingSite | undefined;
    if (site) this.onLandingSiteSelect(site);
  };

  /**
   * Illumination mode: report the surface point under the last raycast. The same raycaster and Moon mesh
   * as the hover readout; the direction is converted by the same tested function (no second mapping).
   */
  private pickSite(): void {
    if (!this.siteSelectionEnabled) return;
    const hit = this.raycaster.intersectObject(this.moonMesh, false)[0];
    if (hit === undefined) return;
    const ll = sceneDirectionToLatLon(hit.point.x, hit.point.y, hit.point.z);
    if (ll === null) return;
    this.onSiteClick({ latDeg: ll.latDeg, lonDeg: ll.lonDeg ?? 0 });
  }

    /** Enable or disable site selection without clearing the current site. */
  setSiteSelectionEnabled(enabled: boolean): void {
    this.siteSelectionEnabled = enabled;
    this.host.requestRender();
  }

  /** The Moon's raster, for site analysis (the SAME data the terrain mesh was built from), or null if not loaded. */
  getElevationRaster(): ElevationRaster | null {
    return this.elevation;
  }

  /** Draw (or clear) the selected-site marker just above the highest terrain. Position uses the app's one lat/lon mapping. */
  setSelectedSite(site: SiteClick | null): void {
    if (site === null) {
      if (this.selectedSiteMarker !== null) this.selectedSiteMarker.visible = false;
    } else {
      if (this.selectedSiteMarker === null) {
        this.selectedSiteMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.014, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x38e8ff, depthTest: false }),
        );
        this.selectedSiteMarker.renderOrder = 10;
        this.host.scene.add(this.selectedSiteMarker);
      }
      const p = toScene(latLonToUnit(site.latDeg, site.lonDeg));
      this.selectedSiteMarker.position.set(p.x * 1.018, p.y * 1.018, p.z * 1.018);
      this.selectedSiteMarker.visible = true;
    }
    this.host.requestRender();
  }

  /** One raycast per animation frame at most; hidden while a button is held (dragging the camera). */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0) {
      this.pendingMove = null;
      this.onPointerReadout(null);
      return;
    }
    this.pendingMove = event;
    if (this.moveFrame !== 0) return;
    this.moveFrame = requestAnimationFrame(() => {
      this.moveFrame = 0;
      const e = this.pendingMove;
      this.pendingMove = null;
      if (e === null || this.disposed) return;
      this.onPointerReadout(this.readoutAt(e));
    });
  };

  private readonly handlePointerLeave = (): void => {
    this.pendingMove = null;
    this.onPointerReadout(null);
  };

  /** Latitude, longitude and height under the pointer, or null if the pointer is not over the Moon. */
  private readoutAt(event: PointerEvent): PointReadout | null {
    const rect = this.host.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.host.camera);
    const hit = this.raycaster.intersectObject(this.moonMesh, false)[0];
    if (hit === undefined) return null;
    return readoutAtScenePoint(hit.point.x, hit.point.y, hit.point.z, this.elevation);
  }

  constructor(
    container: HTMLElement,
    onTextureInfo: (info: MoonTextureInfo) => void,
    onLandingSiteSelect: (site: LandingSite) => void = () => undefined,
    onTerrainStatus: (status: TerrainStatus) => void = () => undefined,
    onPointerReadout: (readout: PointReadout | null) => void = () => undefined,
    onElevationInfo: (info: ElevationInfo | null) => void = () => undefined,
    onSiteClick: (site: SiteClick) => void = () => undefined,
  ) {
    this.onSiteClick = onSiteClick;
    this.onPointerReadout = onPointerReadout;
    this.onElevationInfo = onElevationInfo;
    this.onLandingSiteSelect = onLandingSiteSelect;
    this.host = new SceneHost(container, {
      fovDeg: 35,
      near: 0.1,
      far: 200,
      minDistance: 1.25,
      maxDistance: 12,
      clearColor: 0x03050a,
      afterRender: (h) => this.positionLabels(h),
    });
    const scene = this.host.scene;

    // The globe, built from our own tested lat/lon mesh.
    const mesh = buildLatLonSphere(1, TERRAIN_MESH_LON_SEGMENTS, TERRAIN_MESH_LAT_SEGMENTS);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    this.moonMaterial = new THREE.MeshStandardMaterial({
      map: createProceduralMoonTexture(),
      roughness: 1,
      metalness: 0,
    });
    this.moonMesh = new THREE.Mesh(geometry, this.moonMaterial);
this.moonMesh.castShadow = true;
this.moonMesh.receiveShadow = true;
    scene.add(this.moonMesh);
    onTextureInfo(PROCEDURAL_INFO);

    // Real NASA LRO LOLA terrain. The status is "active" only after the data was loaded, validated,
    // turned into a displaced mesh and written into the geometry; otherwise it says why not.
    const exaggeration = exaggerationFromSearch(window.location.search);
    const footprint = footprintForApp(window.location.search);
    onTerrainStatus({ state: 'loading' });
    void loadNasaMoonElevation().then((loaded) => {
      if (this.disposed) return;
      if (!loaded.ok) {
        console.error('Terrain unavailable:', loaded.reason);
        onTerrainStatus({ state: 'unavailable', reason: loaded.reason });
        return;
      }
      try {
        const terrain = buildTerrainMesh(
          mesh.positions,
          loaded.raster,
          TERRAIN_MESH_LON_SEGMENTS,
          TERRAIN_MESH_LAT_SEGMENTS,
          exaggeration,
          footprint,
        );
        // Update the existing buffers in place: no second copy of the geometry, nothing to leak.
        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
        (position.array as Float32Array).set(terrain.positions);
        (normal.array as Float32Array).set(terrain.normals);
        position.needsUpdate = true;
        normal.needsUpdate = true;
        geometry.computeBoundingSphere();
        this.elevation = loaded.raster;
        this.applyVisualMode(); // Elevation may have been chosen before the data arrived
        this.host.requestRender();
        onTerrainStatus({
          state: 'active',
          exaggeration,
          minHeightMetres: terrain.minHeightMetres,
          maxHeightMetres: terrain.maxHeightMetres,
          footprint,
        });
        console.info(
          'NASA lunar terrain active:',
          `${terrain.minHeightMetres.toFixed(1)} m to ${terrain.maxHeightMetres.toFixed(1)} m above the 1737.4 km sphere,`,
          `exaggeration ${String(exaggeration)}x, ${footprint} footprint`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error('Terrain could not be applied:', error);
        onTerrainStatus({ state: 'unavailable', reason: `The elevation data was loaded but could not be applied: ${detail}` });
      }
    });

    // Lights: one directional "Sun" plus a faint display-only ambient term.
    this.sunLight = new THREE.DirectionalLight(0xffffff, Math.PI);
this.sunLight.castShadow = true;
this.sunLight.shadow.mapSize.set(1024, 1024);
this.sunLight.shadow.camera.left = -1.5;
this.sunLight.shadow.camera.right = 1.5;
this.sunLight.shadow.camera.top = 1.5;
this.sunLight.shadow.camera.bottom = -1.5;
this.sunLight.shadow.camera.near = 0.1;
this.sunLight.shadow.camera.far = 20;
this.sunLight.shadow.bias = -0.0001;
this.sunLight.shadow.normalBias = 0.005;
this.sunLight.shadow.camera.updateProjectionMatrix();
scene.add(this.sunLight);    this.ambient = new THREE.AmbientLight(0xffffff, 0.06 * Math.PI);
    scene.add(this.ambient);

    // Coordinate grid (equator and prime meridian emphasised).
    const g = buildGraticule(1.014, 30);
    const lines = (data: Float32Array, color: number, opacity: number): THREE.LineSegments => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    };
    this.graticuleGroup.add(lines(g.minor, 0x7fa6d6, 0.35));
    this.graticuleGroup.add(lines(g.equator, 0xf2b84b, 0.8));
    this.graticuleGroup.add(lines(g.primeMeridian, 0x5fe0b0, 0.8));
    scene.add(this.graticuleGroup);

    // Direction markers: toward the Sun, toward the Earth, and the points directly under each.
    this.sunArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.9, 0xffd479, 0.1, 0.05);
    this.earthArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.9, 0x6cb8ff, 0.1, 0.05);
    const dot = (color: number): THREE.Mesh =>
      new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color }));
    this.subSolarDot = dot(0xffd479);
    this.subEarthDot = dot(0x6cb8ff);
    this.markerGroup.add(this.sunArrow, this.earthArrow, this.subSolarDot, this.subEarthDot);
    scene.add(this.markerGroup);

    for (const marker of this.landingSiteMarkers) {
      this.overlayGroup.add(marker.object);
    }
    scene.add(this.overlayGroup);

    const canvas = this.host.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);

    const labels = this.host.labels;
    labels.define('north', 'N', 'pole');
    labels.define('south', 'S', 'pole');
    labels.define('sun', 'Toward Sun', 'sun');
    labels.define('earth', 'Toward Earth (approx.)', 'earth');
    labels.define('lon0', '0\u00b0', 'grid');
    labels.define('lon90e', '90\u00b0E', 'grid');
    labels.define('lon90w', '90\u00b0W', 'grid');
    labels.define('lon180', '180\u00b0', 'grid');

    this.applyLayers();
    this.applyDisplay();
    this.setCameraPreset('nearSide');

    // Optional real texture: replace the placeholder if the file is present.
    void loadNasaMoonTexture().then((texture) => {
      if (texture === null) return;
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.anisotropy = this.host.renderer.capabilities.getMaxAnisotropy();
      const old = this.moonMaterial.map;
      this.moonMaterial.map = texture;
      this.moonMaterial.needsUpdate = true;
      if (old) old.dispose();
      onTextureInfo(NASA_INFO);
      this.host.requestRender();
    });
  }

  /**
   * Choose what the ONE Moon mesh is drawn with. The geometry, camera, clock, markers and terrain are
   * never touched: only the mesh's material changes. 'elevation' needs the terrain data; without it the
   * Moon stays in its Normal appearance and onElevationInfo reports null.
   */
  setVisualisationMode(mode: SceneVisualMode): void {
    this.visualMode = mode;
    this.applyVisualMode();
  }

  /** Palette, range, banding or Sun-shading change. Re-colours the existing texture in place. */
  setElevationSettings(settings: ElevationSettings): void {
    const needsRebake =
      this.elevationData !== null &&
      (settings.palette !== this.elevationSettings.palette ||
        settings.range !== this.elevationSettings.range ||
        settings.banding !== this.elevationSettings.banding);
    this.elevationSettings = settings;
    if (needsRebake) this.rebakeElevation();
    this.applyVisualMode();
  }

  private currentElevationRange(): DisplayRange | null {
    return this.elevationData === null ? null : displayRange(this.elevationData.stats, this.elevationSettings.range);
  }

  private rebakeElevation(): void {
    const data = this.elevationData;
    const range = this.currentElevationRange();
    if (data === null || range === null) return;
    bakeRgba(data.mean, ELEVATION_TEXTURE_WIDTH, ELEVATION_TEXTURE_HEIGHT, buildColourLut(this.elevationSettings, range), data.rgba);
    data.texture.needsUpdate = true;
  }

  /** Statistics, averaged counts and the texture, built once (about half a second on a fast PC). */
  private ensureElevationData(raster: ElevationRaster): void {
    if (this.elevationData !== null) return;
    const stats = computeElevationStats(raster);
    const mean = resampleMeanCounts(raster, ELEVATION_TEXTURE_WIDTH, ELEVATION_TEXTURE_HEIGHT);
    const rgba = new Uint8Array(ELEVATION_TEXTURE_WIDTH * ELEVATION_TEXTURE_HEIGHT * 4);
    const range = displayRange(stats, this.elevationSettings.range);
    bakeRgba(mean, ELEVATION_TEXTURE_WIDTH, ELEVATION_TEXTURE_HEIGHT, buildColourLut(this.elevationSettings, range), rgba);
    const texture = new THREE.DataTexture(rgba, ELEVATION_TEXTURE_WIDTH, ELEVATION_TEXTURE_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping; // the longitude seam
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.flipY = false; // rows already run south to north (see elevationColour.ts)
    texture.anisotropy = this.host.renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    // Flat colours: no lighting, so brightness cannot be mistaken for height.
    this.elevationFlat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    // Optional: the same colours under the simulated Sun (brightness then also reflects sunlight).
    this.elevationLit = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
    this.elevationData = { stats, mean, rgba, texture };
  }

  private applyVisualMode(): void {
    if (this.disposed) return;
    if (this.visualMode === 'elevation' && this.elevation !== null) {
      try {
        this.ensureElevationData(this.elevation);
      } catch (error) {
        console.error('Elevation colours could not be prepared:', error);
        this.moonMesh.material = this.moonMaterial;
        this.onElevationInfo(null);
        this.host.requestRender();
        return;
      }
      const material = this.elevationSettings.sunShading ? this.elevationLit : this.elevationFlat;
      const range = this.currentElevationRange();
      if (material !== null && this.elevationData !== null && range !== null) {
        this.moonMesh.material = material;
        this.onElevationInfo({ stats: this.elevationData.stats, range });
      }
    } else {
      this.moonMesh.material = this.moonMaterial;
      this.onElevationInfo(null);
    }
    this.host.requestRender();
  }

  setCameraPreset(preset: MoonCameraPreset): void {
    this.host.setPose(moonCameraPose(preset, CAMERA_DISTANCE));
  }

  setLayers(layers: MoonLayers): void {
    this.layers = layers;
    this.applyLayers();
  }

  setDisplay(display: MoonDisplay): void {
    this.display = display;
    this.applyDisplay();
  }

  /** Receive the shared simulation state. Cheap: ignores a frame it has already shown. */
  update(frame: FrameData): void {
    if (this.disposed || frame === this.lastFrame) return;
    this.lastFrame = frame;
    const snap = frame.snapshot;
    if (snap === null) return;

    const sun = toScene(snap.lighting.sunDirMoonFixed);
    const earth = toScene(snap.lighting.earthDirMoonFixed);
    this.sunDir.set(sun.x, sun.y, sun.z);
    this.earthDir.set(earth.x, earth.y, earth.z);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(SUN_LIGHT_DISTANCE);
    this.sunArrow.setDirection(this.sunDir);
    this.earthArrow.setDirection(this.earthDir);

    const ss = toScene(latLonToUnit(snap.lighting.subSolar.latDeg, snap.lighting.subSolar.lonDeg));
    this.subSolarDot.position.set(ss.x * 1.006, ss.y * 1.006, ss.z * 1.006);
    const se = toScene(latLonToUnit(snap.lighting.subEarth.latDeg, snap.lighting.subEarth.lonDeg));
    this.subEarthDot.position.set(se.x * 1.006, se.y * 1.006, se.z * 1.006);
    this.host.requestRender();
  }

  private applyLayers(): void {
    this.graticuleGroup.visible = this.layers.graticule;
    this.markerGroup.visible = this.layers.markers;
    this.overlayGroup.visible = this.layers.landingSites;
    this.host.requestRender();
  }

  private applyDisplay(): void {
    this.sunLight.intensity = Math.PI * this.display.brightness;
    this.ambient.intensity = Math.PI * this.display.darkSide;
    this.host.requestRender();
  }

  private positionLabels(h: SceneHost): void {
    const labels = h.labels;
    const cam = h.camera.position;
    const camVec = { x: cam.x, y: cam.y, z: cam.z };
    const w = h.width;
    const ht = h.height;
    const show = (id: string, x: number, y: number, z: number, visible: boolean): void => {
      this.tmpWorld.set(x, y, z);
      const hidden = segmentHitsSphere(camVec, { x, y, z }, this.origin, 1);
      labels.place(id, this.tmpWorld, h.camera, w, ht, visible && !hidden);
    };
    show('north', 0, 1.07, 0, this.layers.graticule);
    show('south', 0, -1.07, 0, this.layers.graticule);
    show('sun', this.sunDir.x * 2.0, this.sunDir.y * 2.0, this.sunDir.z * 2.0, this.layers.markers);
    show('earth', this.earthDir.x * 2.0, this.earthDir.y * 2.0, this.earthDir.z * 2.0, this.layers.markers);
    for (const [id, lon] of [['lon0', 0], ['lon90e', 90], ['lon90w', -90], ['lon180', 180]] as const) {
      const p = toScene(latLonToUnit(0, lon));
      show(id, p.x * 1.06, p.y * 1.06, p.z * 1.06, this.layers.graticule);
    }
  }

  /** Pause or resume drawing (used when the other environment is shown). Keeps all scene state. */
  setPaused(paused: boolean): void {
    this.host.setPaused(paused);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.selectedSiteMarker !== null) {
      this.selectedSiteMarker.geometry.dispose();
      (this.selectedSiteMarker.material as THREE.Material).dispose();
      this.selectedSiteMarker = null;
    }
    const canvas = this.host.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    if (this.moveFrame !== 0) cancelAnimationFrame(this.moveFrame);
    this.elevation = null;
    // Materials that are not currently on the mesh are not reached by the scene traversal: release them here.
    this.elevationFlat?.dispose();
    this.elevationLit?.dispose();
    this.elevationData?.texture.dispose();
    this.elevationData = null;
    this.moonMaterial.map?.dispose();
    this.moonMaterial.dispose();
    // ArrowHelper parts are not always covered by a generic traverse in older versions; release them explicitly.
    for (const arrow of [this.sunArrow, this.earthArrow]) {
      arrow.line.geometry.dispose();
      (arrow.line.material as THREE.Material).dispose();
      arrow.cone.geometry.dispose();
      (arrow.cone.material as THREE.Material).dispose();
    }
    this.host.dispose();
  }
}

