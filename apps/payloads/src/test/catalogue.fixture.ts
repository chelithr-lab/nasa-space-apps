// Loads the real generated catalogue for tests (run `npm run catalogue` first).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCatalogue } from '../data/catalogue';
import type { CatalogueRaw } from '../types/catalogue';

export function loadRealCatalogue() {
  // Vitest runs from the app folder, where the generated index lives.
  const file = path.resolve(process.cwd(), 'public/data/catalogue.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as CatalogueRaw;
  return buildCatalogue(raw);
}
