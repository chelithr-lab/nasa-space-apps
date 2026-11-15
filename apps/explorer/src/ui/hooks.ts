import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SimStore, UiSnapshot } from '../sim/simStore.ts';

/** Subscribe a component to the shared simulation store (updates at a limited rate while playing). */
export function useSimUi(store: SimStore): UiSnapshot {
  return useSyncExternalStore(store.subscribeUi, store.getUiSnapshot);
}

/**
 * The computer's real clock, for DISPLAY and for the "gap from now" read-out only.
 * It never feeds the astronomy: simulation time always comes from the shared clock.
 */
export function useRealClock(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
