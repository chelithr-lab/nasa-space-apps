import { useSyncExternalStore } from 'react';
import type { ModeState, ModeStore } from '../modes/modeStore.ts';

/** Subscribe a component to the visualisation-mode store. */
export function useModeState(store: ModeStore): ModeState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
