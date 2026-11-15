import type { SolarView } from './SolarPanel.tsx';

export interface LsiLayout {
  readonly view: SolarView;
  /** The layout to return to when fullscreen is left (never 'fullscreen' itself). */
  readonly before: SolarView;
}

/**
 * Pure transition for the LSI layout. Going fullscreen remembers where it came from; leaving fullscreen goes back
 * there. Choosing minimised or expanded directly just sets it. The panel's data and analysis state are not touched.
 */
export function nextLsiView(cur: LsiLayout, to: SolarView): LsiLayout {
  if (to === 'fullscreen') return cur.view === 'fullscreen' ? cur : { view: 'fullscreen', before: cur.view };
  if (cur.view === 'fullscreen' && to === 'expanded') return { view: cur.before, before: cur.before };
  return { view: to, before: to };
}
