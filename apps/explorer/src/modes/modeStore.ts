/**
 * Visualisation-mode state: a tiny framework-free store.
 *
 * It holds ONE thing, the active mode. The camera, the shared simulation clock and the selected
 * mission live where they already live; a mode switch cannot touch them because they are not here.
 * The Moon scene can subscribe to this store later (Phase C) to change its layers.
 */
import { DEFAULT_MODE, isModeId } from './visualisationModes.ts';
import type { ModeId } from './visualisationModes.ts';

export interface ModeState {
  readonly active: ModeId;
}

export type ModeAction = { readonly type: 'select'; readonly mode: unknown } | { readonly type: 'reset' };

export const INITIAL_MODE_STATE: ModeState = { active: DEFAULT_MODE };

/** Pure reducer. An unknown mode id is ignored; selecting the active mode returns the same object. */
export function reduceMode(state: ModeState, action: ModeAction): ModeState {
  switch (action.type) {
    case 'select':
      if (!isModeId(action.mode) || action.mode === state.active) return state;
      return { active: action.mode };
    case 'reset':
      return state.active === DEFAULT_MODE ? state : INITIAL_MODE_STATE;
  }
}

export interface ModeStore {
  getState(): ModeState;
  select(mode: unknown): void;
  reset(): void;
  /** Returns an unsubscribe function. Listeners run once per real change. */
  subscribe(listener: (state: ModeState) => void): () => void;
}

export function createModeStore(initial: ModeState = INITIAL_MODE_STATE): ModeStore {
  let state = initial;
  const listeners = new Set<(s: ModeState) => void>();
  const dispatch = (action: ModeAction): void => {
    const next = reduceMode(state, action);
    if (next === state) return;
    state = next;
    for (const l of [...listeners]) l(state);
  };
  return {
    getState: () => state,
    select: (mode) => dispatch({ type: 'select', mode }),
    reset: () => dispatch({ type: 'reset' }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
