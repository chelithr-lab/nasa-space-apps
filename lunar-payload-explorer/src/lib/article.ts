// Turns a payload article into tab sections (FR-D2, DR-4, DR-8). Pure: no React, no DOM.
import type { Article, ImageItem } from '../types/payload';
import { isRecord } from './guards';
import { humanise, slugifyKey } from './format';

/** Which renderer a section uses. Unknown keys use the generic renderer (DR-4). */
export type SectionKind = 'prose' | 'physical' | 'transport' | 'gallery' | 'references' | 'generic';

export interface ArticleSection {
  slug: string;
  /** The article key, e.g. "operating_principle". */
  key: string;
  label: string;
  kind: SectionKind;
  value: unknown;
  /** Images attached to this section (from a sibling "<key>_images" list), or null. */
  images: ImageItem[] | null;
}

// Tab order (FR-D2). Unknown keys are inserted before Images.
const STANDARD: ReadonlyArray<readonly [key: string, label: string, kind: SectionKind]> = [
  ['overview', 'Overview', 'prose'],
  ['description', 'Description', 'prose'],
  ['scientific_purpose_and_applications', 'Scientific Purpose & Applications', 'prose'],
  ['operating_principle', 'Operating Principle', 'prose'],
  ['scientific_importance', 'Scientific Importance', 'prose'],
  ['physical_specifications', 'Physical Specifications', 'physical'],
  ['environmental_and_operational_requirements', 'Environment & Operations', 'prose'],
  ['limitations', 'Limitations', 'prose'],
  ['transportation_and_deployment', 'Transportation & Deployment', 'transport'],
  ['historical_significance', 'Historical Significance', 'prose'],
  ['limitations_and_uncertainties', 'Uncertainties', 'prose'],
];

const TAIL: ReadonlyArray<readonly [key: string, label: string, kind: SectionKind]> = [
  ['images', 'Images', 'gallery'],
  ['references', 'References', 'references'],
];

const KNOWN_KEYS = new Set([...STANDARD, ...TAIL].map(([key]) => key));

const TAB_SLUG: Readonly<Record<string, string>> = {
  scientific_purpose_and_applications: 'purpose',
  environmental_and_operational_requirements: 'environment',
  transportation_and_deployment: 'transportation',
  limitations_and_uncertainties: 'uncertainties',
  physical_specifications: 'specifications',
};

export const slugFor = (key: string): string => TAB_SLUG[key] ?? slugifyKey(key);

/** A non-empty list of objects that each have an image_url. */
export function isImageList(value: unknown): value is ImageItem[] {
  return Array.isArray(value) && value.length > 0 && value.every((x) => isRecord(x) && 'image_url' in x);
}

export function isEmptyValue(value: unknown): boolean {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

/** Maps a section key to the "<key>_images" list stored beside it (DR-8). */
export function attachedImageKeys(article: Article): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(article)) {
    const m = key.match(/^(.+)_images$/);
    const base = m?.[1];
    if (base && Object.hasOwn(article, base) && isImageList(value)) map.set(base, key);
  }
  return map;
}

/** Builds the tab sections in display order. Empty values are skipped. */
export function buildSections(article: Article): ArticleSection[] {
  const attached = attachedImageKeys(article);
  const attachedListKeys = new Set(attached.values());
  const out: ArticleSection[] = [];

  const add = (key: string, label: string, kind: SectionKind) => {
    const value = article[key];
    if (isEmptyValue(value)) return;
    const imageKey = attached.get(key);
    const images = imageKey !== undefined && isImageList(article[imageKey]) ? (article[imageKey] as ImageItem[]) : null;
    out.push({ slug: slugFor(key), key, label, kind, value, images });
  };

  for (const [key, label, kind] of STANDARD) add(key, label, kind);
  for (const key of Object.keys(article)) {
    if (!KNOWN_KEYS.has(key) && !attachedListKeys.has(key)) add(key, humanise(key), 'generic');
  }
  for (const [key, label, kind] of TAIL) add(key, label, kind);

  return out;
}

/** Image for the feature figure: the first overview image, else the first image in the registry. */
export function featureImages(article: Article): ImageItem[] {
  const overview = article.overview_images;
  if (isImageList(overview)) return overview;
  return isImageList(article.images) ? article.images : [];
}
