import { describe, expect, it } from 'vitest';
import { loadRealCatalogue } from '../test/catalogue.fixture';
import { buildCatalogue } from './catalogue';
import type { CatalogueRaw } from '../types/catalogue';

describe('buildCatalogue', () => {
  const catalogue = loadRealCatalogue();

  it('has 16 categories and 320 payloads, and category counts sum to 320', () => {
    expect(catalogue.categories).toHaveLength(16);
    expect(catalogue.payloads).toHaveLength(320);
    expect(catalogue.categories.reduce((sum, c) => sum + c.payloads.length, 0)).toBe(320);
  });

  it('links each payload to its category object', () => {
    const p = catalogue.payloadByNumber.get(13);
    expect(p?.name).toBe('Fluxgate magnetometer');
    expect(p?.categoryRef.number).toBe(1);
    expect(p?.hasDetail).toBe(true);
  });

  it('keeps duplicate names as separate payloads', () => {
    expect(catalogue.payloadByNumber.get(70)?.name).toBe('Gas chromatograph');
    expect(catalogue.payloadByNumber.get(144)?.name).toBe('Gas chromatograph');
  });

  it('rejects a payload that points at an unknown category', () => {
    const raw: CatalogueRaw = {
      generated_at: '2026-01-01T00:00:00Z',
      source: 'test',
      counts: { categories: 1, payloads: 1, with_details: 0 },
      categories: [{ number: 1, name: 'A', slug: 'a', description: '', icon: 'target', payload_numbers: [1] }],
      payloads: [{ number: 1, name: 'X', slug: 'x', category: 99, detail_file: null, thumb: null, summary: null }],
    };
    expect(() => buildCatalogue(raw)).toThrow(/unknown category 99/);
  });

  it('marks payloads without an article', () => {
    const raw: CatalogueRaw = {
      generated_at: '2026-01-01T00:00:00Z',
      source: 'test',
      counts: { categories: 1, payloads: 1, with_details: 0 },
      categories: [{ number: 1, name: 'A', slug: 'a', description: '', icon: 'target', payload_numbers: [1] }],
      payloads: [{ number: 1, name: 'X', slug: 'x', category: 1, detail_file: null, thumb: null, summary: null }],
    };
    const built = buildCatalogue(raw);
    expect(built.payloads[0]?.hasDetail).toBe(false);
    expect(built.categories[0]?.withDetail).toBe(0);
  });
});
