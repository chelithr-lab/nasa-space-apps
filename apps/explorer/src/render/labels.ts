/**
 * Text labels drawn as ordinary HTML on top of a WebGL canvas.
 *
 * Each label is a <span> positioned every frame from a 3D point. HTML text is
 * crisper than text drawn inside WebGL and needs no extra library. The layer
 * is decorative (aria-hidden): the same information is in the info panel.
 */
import * as THREE from 'three';

export class LabelLayer {
  private readonly root: HTMLDivElement;
  private readonly items = new Map<string, HTMLSpanElement>();
  private readonly tmp = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'scene-labels';
    this.root.setAttribute('aria-hidden', 'true');
    container.appendChild(this.root);
  }

  /** Create the label if needed and set its text and style class. */
  define(id: string, text: string, className = ''): void {
    let el = this.items.get(id);
    if (el === undefined) {
      el = document.createElement('span');
      el.style.display = 'none';
      this.root.appendChild(el);
      this.items.set(id, el);
    }
    el.className = `scene-label ${className}`.trim();
    if (el.textContent !== text) el.textContent = text;
  }

  hide(id: string): void {
    const el = this.items.get(id);
    if (el !== undefined) el.style.display = 'none';
  }

  /** Place a label at a world position; `visible` false hides it (for example behind a planet). */
  place(id: string, world: THREE.Vector3, camera: THREE.Camera, width: number, height: number, visible: boolean): void {
    const el = this.items.get(id);
    if (el === undefined) return;
    this.tmp.copy(world).project(camera);
    const inFront = this.tmp.z > -1 && this.tmp.z < 1;
    const onScreen = Math.abs(this.tmp.x) <= 1.1 && Math.abs(this.tmp.y) <= 1.1;
    if (!visible || !inFront || !onScreen) {
      el.style.display = 'none';
      return;
    }
    const x = (this.tmp.x * 0.5 + 0.5) * width;
    const y = (-this.tmp.y * 0.5 + 0.5) * height;
    el.style.display = 'block';
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }

  dispose(): void {
    this.items.clear();
    this.root.remove();
  }
}
