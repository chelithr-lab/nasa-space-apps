// Shapes of public/data/catalogue.json (raw) and the derived model used by the UI.

export interface CategoryRaw {
  number: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  payload_numbers: number[];
}

export interface PayloadRaw {
  number: number;
  name: string;
  slug: string;
  /** Category number (see CategoryRaw.number). */
  category: number;
  /** Relative to the app base URL, e.g. "data/payloads/001_…_payload.json", or null. */
  detail_file: string | null;
  /** First usable image URL (absolute), or null. */
  thumb: string | null;
  summary: string | null;
}

export interface CatalogueRaw {
  generated_at: string;
  source: string;
  counts: { categories: number; payloads: number; with_details: number };
  categories: CategoryRaw[];
  payloads: PayloadRaw[];
}

export interface Category extends CategoryRaw {
  payloads: Payload[];
  withDetail: number;
}

export interface Payload extends PayloadRaw {
  hasDetail: boolean;
  categoryRef: Category;
}

export interface Catalogue {
  generatedAt: string;
  counts: CatalogueRaw['counts'];
  categories: Category[];
  payloads: Payload[];
  categoryByNumber: ReadonlyMap<number, Category>;
  payloadByNumber: ReadonlyMap<number, Payload>;
}
