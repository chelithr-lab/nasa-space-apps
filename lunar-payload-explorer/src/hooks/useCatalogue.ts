import { useRouteLoaderData } from 'react-router';
import type { Catalogue } from '../types/catalogue';

/** The catalogue loaded by the root route. Only call inside the router. */
export function useCatalogue(): Catalogue {
  const catalogue = useRouteLoaderData('root') as Catalogue | undefined;
  if (!catalogue) throw new Error('Catalogue is not loaded');
  return catalogue;
}
