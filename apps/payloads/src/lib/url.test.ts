import { describe, expect, it } from 'vitest';
import { hostOf, legacyHashToPath, safeUrl } from './url';

describe('safeUrl (NFR-5)', () => {
  it('allows http and https', () => {
    expect(safeUrl('https://science.nasa.gov/resource/x/')).toBe('https://science.nasa.gov/resource/x/');
    expect(safeUrl('http://example.org')).toBe('http://example.org/');
  });

  it('rejects javascript:, data: and other schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html;base64,PGgxPg==')).toBeNull();
    expect(safeUrl('ftp://example.org/file')).toBeNull();
  });

  it('rejects empty and non-string values', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe('hostOf', () => {
  it('returns the host without www.', () => {
    expect(hostOf('https://www.jpl.nasa.gov/images/x')).toBe('jpl.nasa.gov');
  });
});

describe('legacyHashToPath (prototype links)', () => {
  it('converts hash routes to clean paths, keeping the query', () => {
    expect(legacyHashToPath('#/payload/13?tab=images')).toBe('/payload/13?tab=images');
    expect(legacyHashToPath('#/search?q=radar')).toBe('/search?q=radar');
    expect(legacyHashToPath('#/')).toBe('/');
  });

  it('returns null when there is no hash route', () => {
    expect(legacyHashToPath('')).toBeNull();
    expect(legacyHashToPath('#section')).toBeNull();
    expect(legacyHashToPath('#app')).toBeNull();
  });
});
