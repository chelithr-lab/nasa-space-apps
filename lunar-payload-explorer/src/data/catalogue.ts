// Loads and derives the catalogue index. Loaded once per session; a failed load is not cached.
import type { Catalogue, CatalogueRaw, Category, Payload } from '../types/catalogue';
import { appUrl } from '../lib/url';

/** Builds the derived model (lookup maps, category membership, article flags). Pure. */
export function buildCatalogue(raw: CatalogueRaw): Catalogue {
  const categories: Category[] = raw.categories.map((c) => ({ ...c, payloads: [], withDetail: 0 }));
  const categoryByNumber = new Map(categories.map((c) => [c.number, c]));

  const payloads: Payload[] = raw.payloads.map((p) => {
    const categoryRef = categoryByNumber.get(p.category);
    if (!categoryRef) throw new Error(`Payload #${p.number} refers to unknown category ${p.category}`);
    return { ...p, hasDetail: Boolean(p.detail_file), categoryRef };
  });
  const payloadByNumber = new Map(payloads.map((p) => [p.number, p]));

  for (const c of categories) {
    c.payloads = c.payload_numbers.flatMap((n) => {
      const p = payloadByNumber.get(n);
      return p ? [p] : [];
    });
    c.withDetail = c.payloads.filter((p) => p.hasDetail).length;
  }

  return {
    generatedAt: raw.generated_at,
    counts: raw.counts,
    categories,
    payloads,
    categoryByNumber,
    payloadByNumber,
  };
}

let pending: Promise<Catalogue> | null = null;

export function loadCatalogue(): Promise<Catalogue> {
  if (!pending) {
    pending = fetchJson<CatalogueRaw>(appUrl('data/catalogue.json'), 'Catalogue')
      .then(buildCatalogue)
      .catch((err: unknown) => {
        pending = null; // allow retry
        throw err;
      });
  }
  return pending;
}

/** Test helper: forget the cached catalogue. */
export function resetCatalogueCache(): void {
  pending = null;
}

export async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${what} request failed (${res.status})`);
  return (await res.json()) as T;
}
