import type { PayloadDetail } from '../types/payload';

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Minimal structural check for a payload article file. Anything beyond this is handled defensively in the UI. */
export function isPayloadDetail(v: unknown): v is PayloadDetail {
  return isRecord(v) && isRecord(v.payload) && isRecord(v.payload.article);
}
