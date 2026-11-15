// URL helpers. Only http(s) links are ever rendered (NFR-5).

const currentBase = (): string =>
  typeof window !== 'undefined' ? window.location.href : 'http://localhost/';

/** Returns an absolute http(s) URL, or null for anything else (javascript:, data:, junk). */
export function safeUrl(value: unknown, base: string = currentBase()): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

/** The configured base path without its trailing slash ("" for the root), e.g. "/lunar". */
export const BASE_PATH: string = import.meta.env.BASE_URL.replace(/\/$/, '');

/** URL of a data or asset file, respecting the configured base path. */
export function appUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

/**
 * Converts a prototype hash URL to a clean path: "#/payload/13?tab=images" → "/payload/13?tab=images".
 * Returns null when the URL is not a prototype hash route.
 */
export function legacyHashToPath(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  return hash.slice(1) || '/';
}
