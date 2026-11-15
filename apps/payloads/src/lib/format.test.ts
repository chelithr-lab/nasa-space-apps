import { describe, expect, it } from 'vitest';
import { formatSpecValue, humanise, slugifyKey, splitUnit } from './format';

describe('humanise', () => {
  it('turns keys into labels and drops unit suffixes', () => {
    expect(humanise('short_period_sensor_response_range_hz')).toBe('Short-period sensor response range');
    expect(humanise('mass_kg')).toBe('Mass');
  });

  it('uses overrides and acronyms', () => {
    expect(humanise('scientific_purpose_and_applications')).toBe('Scientific Purpose & Applications');
    expect(humanise('isru_pse_example')).toBe('ISRU PSE example');
  });
});

describe('splitUnit', () => {
  it('recognises known suffixes only', () => {
    expect(splitUnit('thermal_control_heater_power_w')).toEqual({ base: 'thermal_control_heater_power', unit: 'W' });
    expect(splitUnit('power')).toEqual({ base: 'power', unit: '' });
  });
});

describe('formatSpecValue (DR-5)', () => {
  it('formats numbers with units', () => {
    expect(formatSpecValue('mass_kg', 11.5)).toBe('11.5 kg');
    expect(formatSpecValue('short_period_sensor_resonant_period_seconds', 1)).toBe('1 s');
    expect(formatSpecValue('thermal_control_heater_power_w', 2.5)).toBe('2.5 W');
  });

  it('formats two-number arrays as ranges', () => {
    expect(formatSpecValue('short_period_sensor_response_range_hz', [0.05, 20])).toBe('0.05–20 Hz');
  });

  it('formats three-number arrays as dimensions', () => {
    expect(formatSpecValue('external_dimensions_cm', [40, 40, 40])).toBe('40 × 40 × 40 cm');
  });

  it('formats approximate_range objects', () => {
    expect(formatSpecValue('power_consumption_w', { approximate_range: [4.3, 7.4] })).toBe('≈ 4.3–7.4 W');
  });

  it('returns null for structured values so the caller can render them', () => {
    expect(formatSpecValue('examples', [{ name: 'x' }])).toBeNull();
    expect(formatSpecValue('other', { a: 1 })).toBeNull();
  });

  it('formats booleans and plain strings', () => {
    expect(formatSpecValue('flown', true)).toBe('Yes');
    expect(formatSpecValue('note', 'Some text')).toBe('Some text');
  });
});

describe('slugifyKey', () => {
  it('converts underscores to hyphens', () => {
    expect(slugifyKey('operating_principle')).toBe('operating-principle');
  });
});
