// Formatting helpers for JSON keys and specification values (DR-5).

const UNIT_SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ['_seconds', 's'], ['_kg', 'kg'], ['_cm', 'cm'], ['_mm', 'mm'], ['_km', 'km'], ['_m', 'm'],
  ['_hz', 'Hz'], ['_khz', 'kHz'], ['_mhz', 'MHz'], ['_w', 'W'], ['_wh', 'Wh'], ['_v', 'V'],
  ['_c', '°C'], ['_k', 'K'], ['_percent', '%'], ['_days', 'days'], ['_hours', 'h'],
];

const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  scientific_purpose_and_applications: 'Scientific Purpose & Applications',
  environmental_and_operational_requirements: 'Environment & Operations',
  transportation_and_deployment: 'Transportation & Deployment',
  limitations_and_uncertainties: 'Uncertainties',
};

const ACRONYMS: Readonly<Record<string, string>> = {
  hz: 'Hz', pse: 'PSE', fss: 'FSS', isru: 'ISRU', url: 'URL', urls: 'URLs',
};

/** Splits a key into its label part and unit, when the key ends in a known unit suffix. */
export function splitUnit(key: string): { base: string; unit: string } {
  const k = key.toLowerCase();
  for (const [suffix, unit] of UNIT_SUFFIXES) {
    if (k.endsWith(suffix) && k.length > suffix.length) {
      return { base: key.slice(0, -suffix.length), unit };
    }
  }
  return { base: key, unit: '' };
}

/** "short_period_sensor_response_range_hz" → "Short-period sensor response range" */
export function humanise(key: string, { stripUnit = true }: { stripUnit?: boolean } = {}): string {
  const override = LABEL_OVERRIDES[key];
  if (override) return override;
  const base = stripUnit ? splitUnit(key).base : key;
  const words = base
    .split('_')
    .filter(Boolean)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  const s = words.join(' ').replace(/\b(short|long) period\b/gi, '$1-period');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

/**
 * Formats a scalar or simple-array spec value. Returns null when the value is structured,
 * so the caller can render it.
 */
export function formatSpecValue(key: string, value: unknown, inheritedUnit = ''): string | null {
  const unit = splitUnit(key).unit || inheritedUnit;
  const u = unit ? (unit === '%' || unit === '°C' ? unit : ` ${unit}`) : '';

  if (typeof value === 'number') return fmtNum(value) + u;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v): v is number => typeof v === 'number')) {
      if (value.length === 2) return `${fmtNum(value[0] ?? 0)}–${fmtNum(value[1] ?? 0)}${u}`;
      return value.map(fmtNum).join(' × ') + u;
    }
    if (value.every((v): v is string => typeof v === 'string')) return value.join(', ');
    return null;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'approximate_range') {
      const r = formatSpecValue('', (value as { approximate_range: unknown }).approximate_range, unit);
      return r ? `≈ ${r}` : null;
    }
    return null;
  }
  return value == null ? '' : String(value);
}

export const slugifyKey = (key: string): string => key.toLowerCase().replace(/_/g, '-');
