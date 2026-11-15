import { useEffect, useState } from 'react';
import {
  FrameWindow,
  decideGlass,
  parseGlassMode,
  type GlassMode,
  type GlassState,
} from './glassGovernor.ts';

/**
 * Watches requestAnimationFrame callback intervals and sets
 * <html data-glass="glass|solid">.
 *
 * Modes:
 * ?glass=auto|on|off
 *
 * ?perf=1 displays a diagnostic readout.
 *
 * IMPORTANT:
 * This measures browser animation-frame cadence, NOT direct GPU render time.
 */
const STORAGE_KEY = 'clps.glass';
const GLASS_SELECTOR = '.panel-mini, .solar-panel, .lg-g1';

function readMode(): GlassMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('glass');
    if (fromUrl !== null) return parseGlassMode(fromUrl);
  } catch {
    /* no URL access: fall through */
  }

  try {
    return parseGlassMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

/**
 * Checks whether a glass surface is plausibly visible:
 * - has non-zero dimensions
 * - intersects the viewport
 * - is not hidden by display, visibility or opacity on itself
 *   or one of its ancestors
 *
 * This does not detect occlusion by another element.
 */
function glassIsVisible(): boolean {
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;

  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>(GLASS_SELECTOR),
  )) {
    const r = el.getBoundingClientRect();

    if (
      r.width <= 0 ||
      r.height <= 0 ||
      r.right <= 0 ||
      r.bottom <= 0 ||
      r.left >= viewportWidth ||
      r.top >= viewportHeight
    ) {
      continue;
    }

    let visible = true;
    let node: HTMLElement | null = el;

    while (node !== null) {
      const style = window.getComputedStyle(node);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number.parseFloat(style.opacity) <= 0
      ) {
        visible = false;
        break;
      }

      node = node.parentElement;
    }

    if (visible) return true;
  }

  return false;
}

export function useGlassGovernor(): {
  mode: GlassMode;
  state: GlassState;
} {
  const [mode] = useState<GlassMode>(readMode);
  const [state, setState] = useState<GlassState>(
    mode === 'off' ? 'solid' : 'glass',
  );

  useEffect(() => {
    const root = document.documentElement;

    const apply = (s: GlassState) => {
      root.dataset.glass = s;
      setState(s);
    };

    // Create the diagnostic readout BEFORE checking the mode.
    // This ensures it also works with forced glass=on/off.
    const showPerf =
      new URLSearchParams(window.location.search).get('perf') === '1';

    let readout: HTMLDivElement | null = null;

    if (showPerf) {
      readout = document.createElement('div');
      readout.setAttribute('role', 'status');
      readout.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:99999;padding:6px 9px;' +
        'font:12px/1.4 monospace;background:#000c;color:#fff;' +
        'border-radius:4px;pointer-events:none;white-space:pre;';
      document.body.appendChild(readout);
    }

    // Forced modes do not collect performance measurements.
    if (mode !== 'auto') {
      const forcedState: GlassState =
        mode === 'off' ? 'solid' : 'glass';

      apply(forcedState);

      if (readout !== null) {
        readout.textContent =
          `mode ${mode}\n` +
          `state ${forcedState}\n` +
          'RAF measurements disabled (forced mode)';
      }

      return () => {
        readout?.remove();
      };
    }

    apply('glass');

    const baseline = new FrameWindow();
    const glass = new FrameWindow();

    let current: GlassState = 'glass';
    let visible = false;
    let last = 0;
    let raf = 0;
    let lastCheck = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);

      if (document.hidden) {
        last = 0;
        return;
      }

      if (last > 0) {
        (visible ? glass : baseline).push(t - last);
      }

      last = t;

      if (t - lastCheck >= 1000) {
        lastCheck = t;
        visible = glassIsVisible();

        const g = glass.stats();
        const b = baseline.count > 0 ? baseline.stats() : null;

        const next = decideGlass({
          mode,
          current,
          glass: g,
          baseline: b,
        });

        if (next !== current) {
          current = next;
          apply(next);
        }

        if (readout !== null) {
          readout.textContent =
            'RAF interval p95 (ms; not GPU time)\n' +
            `base ${b ? b.p95.toFixed(1) : '-'} ms (${b ? b.frames : 0})\n` +
            `glass ${g.frames ? g.p95.toFixed(1) : '-'} ms (${g.frames})\n` +
            `state ${current}`;
        }
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      readout?.remove();
    };
  }, [mode]);

  return { mode, state };
}