import { createContext } from 'react';

/**
 * Places that other components may render into (through a React portal), so that the Analysis-mode docks and
 * the technical-status area can be filled by components that live elsewhere in the tree without moving state.
 */
export interface Slots {
  dockLeft: HTMLElement | null;
  dockRight: HTMLElement | null;
  status: HTMLElement | null;
}
export const EMPTY_SLOTS: Slots = { dockLeft: null, dockRight: null, status: null };
export const SlotsContext = createContext<Slots>(EMPTY_SLOTS);
