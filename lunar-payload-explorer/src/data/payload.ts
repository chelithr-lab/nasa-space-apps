// Loads one payload article on demand. Cached per payload; a failed load is not cached.
import type { Payload } from '../types/catalogue';
import type { PayloadDetail } from '../types/payload';
import { isPayloadDetail } from '../lib/guards';
import { appUrl } from '../lib/url';
import { fetchJson } from './catalogue';

const cache = new Map<number, Promise<PayloadDetail>>();

/** Resolves to the article, or null when the payload has no article yet (coming soon). */
export async function loadPayloadDetail(payload: Payload): Promise<PayloadDetail | null> {
  if (!payload.detail_file) return null;

  let pending = cache.get(payload.number);
  if (!pending) {
    pending = fetchJson<unknown>(appUrl(payload.detail_file), 'Article')
      .then((json) => {
        if (!isPayloadDetail(json)) throw new Error('Article file has an unexpected format');
        return json;
      })
      .catch((err: unknown) => {
        cache.delete(payload.number);
        throw err;
      });
    cache.set(payload.number, pending);
  }
  return pending;
}

/** Test helper. */
export function resetPayloadCache(): void {
  cache.clear();
}
