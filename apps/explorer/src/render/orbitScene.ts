/**
 * SECONDARY VIEW: Earth-centred orbital geometry.
 *
 * Frame: geocentric EQJ, mapped to scene axes by toScene (north up).
 * Scale: 1 scene unit = 100,000 km. Distances, the Moon's path and the Sun
 * DIRECTION are to scale; the Earth and the Moon are drawn
 * BODY_SIZE_EXAGGERATION times too large. The Sun's distance (about 389
 * times the Moon's) is not drawn: only its direction is shown.
 *
 * The Moon's path is a sample of ephemeris positions around the selected
 * time (see orbitTrack.ts), not an idealised orbit.
 *
 * The Earth's grid turns with the real Earth-fixed orientation from the
 * Stage 2 state (accuracy level 4: polar motion ignored, UT1 approximated by UTC).
 */
import * as THREE from 'three';
import { buildGraticule } from '../sim/graticule.ts';
import { orbitCameraPose } from '../sim/cameraPresets.ts';
import type { OrbitCameraPreset } from '../sim/cameraPresets.ts';
import {
  BODY_SIZE_EXAGGERATION,
  EARTH_MEAN_RADIUS_KM,
  KM_PER_SCENE_UNIT,
  MOON_RADIUS_KM,
  MoonTrackCache,
  kmToSceneUnits,
} from '../sim/orbitTrack.ts';
import type { MoonTrack } from '../sim/orbitTrack.ts';
import { earthModelRotation, mat3ToMatrix4ColumnMajor, toScene } from '../sim/sceneMapping.ts';
import type { FrameData } from '../sim/simStore.ts';
import { buildLatLonSphere } from '../sim/sphereMesh.ts';
import { SceneHost } from './sceneHost.ts';
import { segmentHitsSphere } from '../sim/occlusion.ts';

const CAMERA_DISTANCE = 14;
const EARTH_UNITS = (EARTH_MEAN_RADIUS_KM / KM_PER_SCENE_UNIT) * BODY_SIZE_EXAGGERATION;
const MOON_UNITS = (MOON_RADIUS_KM / KM_PER_SCENE_UNIT) * BODY_SIZE_EXAGGERATION;
const SUN_ARROW_LENGTH = 5.2;

export class OrbitScene {
  private readonly host: SceneHost;
  private readonly earthGroup = new THREE.Group();
  private readonly moonMesh: THREE.Mesh;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly sunArrow: THREE.ArrowHelper;
  private readonly earthMoonLine: THREE.Line;
  private readonly trackMaterial = new THREE.LineBasicMaterial({ color: 0x8fb4e8, transparent: true, opacity: 0.75 });
  private trackLine: THREE.Line | null = null;
  private trackShown: MoonTrack | null = null;
  private readonly trackCache: MoonTrackCache;
  private readonly rotationMatrix = new THREE.Matrix4();
  private readonly moonPos = new THREE.Vector3();
  private readonly sunDir = new THREE.Vector3(1, 0, 0);
  private readonly northTip = new THREE.Vector3(0, EARTH_UNITS * 1.35, 0);
  private readonly tmp = new THREE.Vector3();
  private moonDistanceKm = 0;
  private earthOrientationOk = true;
  private lastFrame: FrameData | null = null;
  private disposed = false;

  constructor(container: HTMLElement, moonKmAt: (utcMs: number) => { x: number; y: number; z: number } | null) {
    this.host = new SceneHost(container, {
      fovDeg: 35,
      near: 0.1,
      far: 400,
      minDistance: 4,
      maxDistance: 40,
      clearColor: 0x04070d,
      afterRender: (h) => this.positionLabels(h),
    });
    this.trackCache = new MoonTrackCache(moonKmAt);
    const scene = this.host.scene;

    // Earth: shaded sphere plus a grid that turns with the real Earth orientation.
    const earthMesh = buildLatLonSphere(EARTH_UNITS, 48, 24);
    const earthGeo = new THREE.BufferGeometry();
    earthGeo.setAttribute('position', new THREE.BufferAttribute(earthMesh.positions, 3));
    earthGeo.setAttribute('normal', new THREE.BufferAttribute(earthMesh.normals, 3));
    earthGeo.setAttribute('uv', new THREE.BufferAttribute(earthMesh.uvs, 2));
    earthGeo.setIndex(new THREE.BufferAttribute(earthMesh.indices, 1));
    this.earthGroup.add(new THREE.Mesh(earthGeo, new THREE.MeshStandardMaterial({ color: 0x1d4f8f, roughness: 1, metalness: 0 })));
    const g = buildGraticule(EARTH_UNITS * 1.01, 30, 72);
    const lines = (data: Float32Array, color: number, opacity: number): THREE.LineSegments => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    };
    this.earthGroup.add(lines(g.minor, 0xa8c8ee, 0.4));
    this.earthGroup.add(lines(g.equator, 0xf2b84b, 0.85));
    this.earthGroup.add(lines(g.primeMeridian, 0x5fe0b0, 0.9));
    const axis = new THREE.BufferGeometry();
    axis.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -EARTH_UNITS * 1.35, 0, 0, EARTH_UNITS * 1.35, 0]), 3));
    this.earthGroup.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    scene.add(this.earthGroup);

    // Moon (plain grey, no surface orientation drawn here).
    const moonGeo = new THREE.SphereGeometry(MOON_UNITS, 24, 16);
    this.moonMesh = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ color: 0xb9b6b0, roughness: 1, metalness: 0 }));
    scene.add(this.moonMesh);

    // Light from the Sun's direction, shared by Earth and Moon.
    this.sunLight = new THREE.DirectionalLight(0xffffff, Math.PI);
    scene.add(this.sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.05 * Math.PI));

    // Sun direction arrow (direction only, not distance).
    this.sunArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), SUN_ARROW_LENGTH, 0xffd479, 0.35, 0.16);
    scene.add(this.sunArrow);

    // Earth-Moon line.
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.earthMoonLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    scene.add(this.earthMoonLine);

    // Distance rings every 100,000 km in the equatorial plane (to scale).
    for (let ring = 1; ring <= 4; ring++) {
      const pts: number[] = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(Math.cos(a) * ring, 0, Math.sin(a) * ring);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pts), 3));
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4a5a73, transparent: true, opacity: 0.55 })));
    }

    const labels = this.host.labels;
    labels.define('earth', 'Earth', 'body');
    labels.define('moon', 'Moon', 'body');
    labels.define('sun', 'Sun direction', 'sun');
    labels.define('north', 'N', 'pole');
    labels.define('distance', '', 'distance');

    this.setCameraPreset('northPolar');
  }

  setCameraPreset(preset: OrbitCameraPreset): void {
    this.host.setPose(orbitCameraPose(preset, CAMERA_DISTANCE));
  }

  update(frame: FrameData): void {
    if (this.disposed || frame === this.lastFrame) return;
    this.lastFrame = frame;
    const snap = frame.snapshot;
    if (snap === null) return;
    const a = snap.astro;

    // Moon position (true direction, true distance).
    const m = kmToSceneUnits(a.moon.geoEqjKm);
    this.moonPos.set(m.x, m.y, m.z);
    this.moonMesh.position.copy(this.moonPos);
    this.moonDistanceKm = a.moon.distanceKm;
    const lp = this.earthMoonLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    lp.setXYZ(0, 0, 0, 0);
    lp.setXYZ(1, m.x, m.y, m.z);
    lp.needsUpdate = true;

    // Sun direction and light.
    const s = toScene(a.sun.dirFromEarthEqj);
    this.sunDir.set(s.x, s.y, s.z);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(60);
    this.sunArrow.setDirection(this.sunDir);

    // Earth orientation from the validated Stage 2 rotation, when available.
    if (a.earth.available) {
      this.rotationMatrix.fromArray(mat3ToMatrix4ColumnMajor(earthModelRotation(a.earth.eqjToEarthFixed)));
      this.earthGroup.quaternion.setFromRotationMatrix(this.rotationMatrix);
      this.earthOrientationOk = true;
    } else {
      this.earthGroup.quaternion.identity();
      this.earthOrientationOk = false;
    }

    // The Moon's computed path (recomputed rarely; same object while valid).
    const track = this.trackCache.get(frame.simMs, performance.now());
    if (track !== this.trackShown) {
      this.trackShown = track;
      this.rebuildTrack(track);
    }
    this.host.requestRender();
  }

  /** True if the Earth grid could be oriented for the current state. */
  get earthOrientationAvailable(): boolean {
    return this.earthOrientationOk;
  }

  private rebuildTrack(track: MoonTrack): void {
    if (this.trackLine !== null) {
      this.host.scene.remove(this.trackLine);
      this.trackLine.geometry.dispose();
      this.trackLine = null;
    }
    if (track.samples.length < 2) return;
    const pos = new Float32Array(track.samples.length * 3);
    track.samples.forEach((smp, i) => {
      const p = kmToSceneUnits(smp.posKm);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trackLine = new THREE.Line(geo, this.trackMaterial);
    this.host.scene.add(this.trackLine);
  }

  private positionLabels(h: SceneHost): void {
    const labels = h.labels;
    const cam = h.camera.position;
    const camVec = { x: cam.x, y: cam.y, z: cam.z };
    const w = h.width;
    const ht = h.height;

    // Earth label sits beside the exaggerated globe.
    labels.place('earth', this.tmp.set(EARTH_UNITS * 0.9, -EARTH_UNITS * 1.15, 0), h.camera, w, ht, true);

    this.tmp.copy(this.moonPos).add(new THREE.Vector3(0, MOON_UNITS * 1.8, 0));
    labels.place('moon', this.tmp, h.camera, w, ht, true);

    this.tmp.copy(this.sunDir).multiplyScalar(SUN_ARROW_LENGTH + 0.4);
    labels.place('sun', this.tmp, h.camera, w, ht, true);

    this.tmp.copy(this.northTip).applyQuaternion(this.earthGroup.quaternion);
    const hidden = segmentHitsSphere(camVec, { x: this.tmp.x, y: this.tmp.y, z: this.tmp.z }, { x: 0, y: 0, z: 0 }, EARTH_UNITS);
    labels.place('north', this.tmp, h.camera, w, ht, !hidden && this.earthOrientationOk);

    labels.define('distance', `${Math.round(this.moonDistanceKm).toLocaleString('en-US')} km`, 'distance');
    this.tmp.copy(this.moonPos).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.25, 0));
    labels.place('distance', this.tmp, h.camera, w, ht, this.moonDistanceKm > 0);
  }

  /** Pause or resume drawing (used when the other environment is shown). Keeps all scene state. */
  setPaused(paused: boolean): void {
    this.host.setPaused(paused);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sunArrow.line.geometry.dispose();
    (this.sunArrow.line.material as THREE.Material).dispose();
    this.sunArrow.cone.geometry.dispose();
    (this.sunArrow.cone.material as THREE.Material).dispose();
    this.trackMaterial.dispose();
    this.host.dispose();
  }
}
