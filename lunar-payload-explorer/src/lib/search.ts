// Search over the catalogue (FR-S2, FR-S5). Pure functions: the index is passed in, not global.
import type { Payload } from '../types/catalogue';

const COMBINING = /[̀-ͯ]/g;

/** Lowercase, strip diacritics, punctuation → space, collapse whitespace. */
export function normalise(input: unknown): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface SearchRecord {
  payload: Payload;
  nameN: string;
  words: string[];
  abbrevN: string;
  categoryN: string;
}

export interface SearchIndex {
  readonly records: readonly SearchRecord[];
}

export interface SearchResult {
  payload: Payload;
  score: number;
  /** 3 = number match, 2 = whole-phrase match, 1 = every term matched separately. */
  tier: 1 | 2 | 3;
}

export function buildSearchIndex(payloads: readonly Payload[]): SearchIndex {
  return {
    records: payloads.map((payload) => {
      const nameN = normalise(payload.name);
      const abbr = payload.name.match(/\(([^)]+)\)/);
      return {
        payload,
        nameN,
        words: nameN.split(' '),
        abbrevN: abbr?.[1] ? normalise(abbr[1]) : '',
        categoryN: normalise(payload.categoryRef.name),
      };
    }),
  };
}

function scoreTerm(r: SearchRecord, t: string): number {
  if (r.nameN === t) return 900;
  if (r.abbrevN && r.abbrevN === t) return 850;
  if (r.nameN.startsWith(t)) return 700;
  if (r.words.some((w) => w.startsWith(t))) return 500;
  if (r.nameN.includes(t)) return 300;
  if (r.categoryN.includes(t)) return 100;
  return 0;
}

/** Ranked matches, best first. An empty query returns no results. */
export function searchPayloads(index: SearchIndex, query: string, limit = Infinity): SearchResult[] {
  const raw = query.trim();
  const q = normalise(raw);
  if (!q) return [];

  const numMatch = raw.match(/^#?\s*(\d{1,3})$/);
  const terms = q.split(' ');
  const results: SearchResult[] = [];

  for (const r of index.records) {
    let tier: 0 | 1 | 2 | 3 = 0;
    let score = 0;
    if (numMatch && r.payload.number === Number(numMatch[1])) {
      tier = 3;
      score = 1000;
    } else {
      const phrase = scoreTerm(r, q);
      if (phrase > 0) {
        tier = 2;
        score = phrase;
      } else if (terms.length > 1) {
        const scores = terms.map((t) => scoreTerm(r, t));
        if (scores.every((x) => x > 0)) {
          tier = 1;
          score = scores.reduce((a, b) => a + b, 0) / scores.length;
        }
      }
    }
    if (tier > 0) results.push({ payload: r.payload, score, tier: tier as 1 | 2 | 3 });
  }

  results.sort((a, b) => b.tier - a.tier || b.score - a.score || a.payload.number - b.payload.number);
  return results.slice(0, limit);
}

/** Accent- and case-insensitive fold that keeps the same length as the input (UTF-16 units). */
function foldChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const folded = ch.normalize('NFD').replace(COMBINING, '').toLowerCase();
    const c = folded.length > 0 ? folded.charAt(0) : ' ';
    out += /[a-z0-9]/.test(c) ? c : ' ';
    if (ch.length === 2) out += ' '; // astral code point: keep one output unit per UTF-16 unit
  }
  return out;
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Splits text into plain and matched segments, for highlighting. Rendering is the caller's job. */
export function highlightSegments(text: string, query: string): Segment[] {
  const terms = [...new Set(normalise(query).split(' ').filter((t) => t.length > 0))]
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text, match: false }];

  const folded = foldChars(text);
  const marked: boolean[] = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marked[k] = true;
      i = folded.indexOf(t, i + t.length);
    }
  }

  const out: Segment[] = [];
  let buf = '';
  let on = false;
  for (let i = 0; i < text.length; i++) {
    const m = marked[i] === true;
    if (m !== on) {
      if (buf) out.push({ text: buf, match: on });
      buf = '';
      on = m;
    }
    buf += text.charAt(i);
  }
  if (buf) out.push({ text: buf, match: on });
  return out;
}
