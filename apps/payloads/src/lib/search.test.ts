import { describe, expect, it } from 'vitest';
import { loadRealCatalogue } from '../test/catalogue.fixture';
import { buildSearchIndex, highlightSegments, normalise, searchPayloads } from './search';

const catalogue = loadRealCatalogue();
const index = buildSearchIndex(catalogue.payloads);
const names = (query: string) => searchPayloads(index, query).map((r) => `#${r.payload.number} ${r.payload.name}`);

describe('normalise', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalise('Mössbauer spectrometer')).toBe('mossbauer spectrometer');
    expect(normalise('  Alpha-Particle (APXS) ')).toBe('alpha particle apxs');
  });
});

describe('search (acceptance criteria AC3)', () => {
  it('"seismo" finds the four seismometers #1–#4', () => {
    const numbers = searchPayloads(index, 'seismo').map((r) => r.payload.number);
    expect(numbers.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(searchPayloads(index, 'seismo').every((r) => /seismo/i.test(r.payload.name))).toBe(true);
  });

  it('"apxs" finds #54 by its abbreviation', () => {
    expect(searchPayloads(index, 'apxs').map((r) => r.payload.number)).toEqual([54]);
  });

  it('"mossbauer" finds the accented #64', () => {
    expect(searchPayloads(index, 'mossbauer').map((r) => r.payload.number)).toEqual([64]);
  });

  it('"gas chromatograph" returns #70 and #144, each with its own category', () => {
    const results = searchPayloads(index, 'gas chromatograph');
    const exact = results.filter((r) => r.payload.name === 'Gas chromatograph');
    expect(exact.map((r) => r.payload.number)).toEqual([70, 144]);
    expect(exact[0]?.payload.categoryRef.number).toBe(3);
    expect(exact[1]?.payload.categoryRef.number).toBe(7);
  });

  it('a bare or #-prefixed number finds that payload', () => {
    expect(names('57')).toEqual(names('#57'));
    expect(searchPayloads(index, '#57')[0]?.payload.number).toBe(57);
  });

  it('"spectrometer" matches 27 payloads, as in the prototype', () => {
    expect(searchPayloads(index, 'spectrometer')).toHaveLength(27);
  });

  it('nonsense returns no results', () => {
    expect(searchPayloads(index, 'xyzzy')).toEqual([]);
  });

  it('an empty or whitespace query returns no results', () => {
    expect(searchPayloads(index, '   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchPayloads(index, 'spectrometer', 8)).toHaveLength(8);
  });
});

describe('highlightSegments', () => {
  it('marks the matched text and keeps the original characters', () => {
    expect(highlightSegments('Mössbauer spectrometer', 'mossbauer')).toEqual([
      { text: 'Mössbauer', match: true },
      { text: ' spectrometer', match: false },
    ]);
  });

  it('returns the whole text when the query is empty', () => {
    expect(highlightSegments('Radar', '')).toEqual([{ text: 'Radar', match: false }]);
  });
});
