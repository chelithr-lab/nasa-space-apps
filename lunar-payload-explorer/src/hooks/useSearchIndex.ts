import { useMemo } from 'react';
import type { Catalogue } from '../types/catalogue';
import { buildSearchIndex, type SearchIndex } from '../lib/search';
import { useCatalogue } from './useCatalogue';

// One index per loaded catalogue, shared by the header search, the hero search and the results page.
const indexes = new WeakMap<Catalogue, SearchIndex>();

export function useSearchIndex(): SearchIndex {
  const catalogue = useCatalogue();
  return useMemo(() => {
    let index = indexes.get(catalogue);
    if (!index) {
      index = buildSearchIndex(catalogue.payloads);
      indexes.set(catalogue, index);
    }
    return index;
  }, [catalogue]);
}
