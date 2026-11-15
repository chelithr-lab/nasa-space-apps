import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EDGE_CLOSE_DELAY_MS } from './edgePanelConfig.ts';
import { SlotsContext } from './slots.ts';

/**
 * A control attached to a screen edge.
 *
 * Immersive: a tab sits on the edge (always visible, so the control is discoverable). Pointing at the tab or the panel
 * opens the panel flush against the edge. Leaving closes it after a short delay. The Pin button keeps it open,
 * Esc closes it, and keyboard focus opens it.
 *
 * Analysis (dock = true): the same content is shown permanently in a docked rail on that edge, through a portal.
 *
 * Either way the panel floats over or beside the scene and never resizes it by itself. Styling is in immersive.css.
 */
interface Props {
  side: 'left' | 'right';
  label: string;
  /** CSS `top` of the tab, for example '38%'. */
  handleTop: string;
  /** Panel width in px (immersive). */
  width?: number;
  /** Show the content in the docked rail for this side instead of the hover panel. */
  dock?: boolean;
  /** A small amber dot on the tab: there is something to read in the panel. */
  note?: boolean;
  children: ReactNode;
}

export function EdgePanel({ side, label, handleTop, width = 340, dock = false, note = false, children }: Props) {
  const panelId = useId();
  const slots = useContext(SlotsContext);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const enter = useCallback((): void => {
    window.clearTimeout(timer.current);
    setHover(true);
  }, []);
  const leave = useCallback((): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(false), EDGE_CLOSE_DELAY_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (dock) {
    const target = side === 'left' ? slots.dockLeft : slots.dockRight;
    if (target === null) return null;
    return createPortal(
      <section className="dock-section" aria-label={label}>
        <h3 className="dock-head">{label}</h3>
        {children}
      </section>,
      target,
    );
  }

  const open = pinned || hover;
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      window.clearTimeout(timer.current);
      setPinned(false);
      setHover(false);
    }
  };

  return (
    <div
      className={`ep ep-${side}`}
      data-open={open}
      onKeyDown={onKeyDown}
      onFocus={enter}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave();
      }}
    >
      <button
        type="button"
        className="ep-handle"
        style={{ top: handleTop }}
        aria-expanded={open}
        aria-controls={panelId}
        data-pinned={pinned}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        title={`${label}: point here to open, click to pin`}
      >
        {label}
        {note && <span className="ep-note" aria-hidden="true" />}
      </button>
      <div
        id={panelId}
        className="ep-panel lg-g1 lg-dense"
        role="region"
        aria-label={label}
        style={{ width }}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        <div className="ep-head">
          <h3 className="ep-head-title">{label}</h3>
          <button type="button" className="ep-pin" aria-pressed={pinned} onClick={() => setPinned((p) => !p)} title={pinned ? 'Unpin' : 'Keep open'}>
            {pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
