/**
 * Shared plumbing for a Three.js view: renderer, camera, orbit controls,
 * label layer, resizing, an on-demand render loop and complete clean-up.
 * The two views (Moon and Earth-Moon) build their own objects on top of it.
 *
 * Rendering happens only when something changed (`requestRender()`, a camera
 * move, or a resize) to spare laptop and phone batteries.
 *
 * Throws in the constructor if WebGL is unavailable; callers catch that and
 * show a message instead of a blank panel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraPose } from '../sim/cameraPresets.ts';
import { LabelLayer } from './labels.ts';

export interface SceneHostOptions {
  fovDeg: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  clearColor: number;
  /** Called every time a frame is drawn, after the 3D render, to position labels. */
  afterRender: (host: SceneHost) => void;
}

/** Release GPU memory held by every geometry, material and texture under `root`. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const anyObj = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (anyObj.geometry !== undefined) anyObj.geometry.dispose();
    const mat = anyObj.material;
    const list = mat === undefined ? [] : Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      const map = (m as THREE.Material & { map?: THREE.Texture | null }).map;
      if (map) map.dispose();
      m.dispose();
    }
  });
}

export class SceneHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly labels: LabelLayer;
  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly afterRender: (host: SceneHost) => void;
  private rafId = 0;
  private dirty = true;
  private disposed = false;
  private paused = false;

  constructor(container: HTMLElement, options: SceneHostOptions) {
    // The renderer is created first: if WebGL is missing this throws before anything else is allocated.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container = container;
    this.afterRender = options.afterRender;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(options.clearColor, 1);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(options.fovDeg, 1, options.near, options.far);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.7;
    this.controls.minDistance = options.minDistance;
    this.controls.maxDistance = options.maxDistance;
    this.controls.addEventListener('change', this.requestRender);

    this.labels = new LabelLayer(container);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.rafId = window.requestAnimationFrame(this.loop);
  }

  requestRender = (): void => {
    this.dirty = true;
  };

  /**
   * Stop drawing while this view is hidden (the other environment is showing). Nothing is destroyed:
   * the scene, textures and camera stay as they are, and one frame is drawn when the view returns.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.requestRender();
  }

  /** Move the camera to a preset pose (target is always the origin). Does not touch simulation state. */
  setPose(pose: CameraPose): void {
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  get width(): number {
    return this.container.clientWidth;
  }

  get height(): number {
    return this.container.clientHeight;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private loop = (): void => {
    if (this.disposed) return;
    if (this.paused) {
      this.rafId = window.requestAnimationFrame(this.loop);
      return;
    }
    this.controls.update(); // applies damping; fires 'change' (-> requestRender) while the camera is moving
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.afterRender(this);
    }
    this.rafId = window.requestAnimationFrame(this.loop);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.requestRender);
    this.controls.dispose();
    disposeObject3D(this.scene);
    this.labels.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
