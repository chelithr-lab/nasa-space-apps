import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/** Changing only ?tab= must not scroll or move focus (the prototype behaviour). */
function routeKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete('tab');
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/**
 * After a route change: scroll to the top and move focus to the page heading (FR-G4).
 * Runs only when the route actually changes, not on the first render or under StrictMode's double effects.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement | null>): void {
  const { pathname, search } = useLocation();
  const key = routeKey(pathname, search);
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const heading = mainRef.current?.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }, [key, mainRef]);
}
