import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Article } from '../types/payload';
import { attachedImageKeys, buildSections, featureImages, isEmptyValue, slugFor } from './article';

function loadArticle(file: string): Article {
  const full = path.resolve(process.cwd(), 'public/data/payloads', file);
  return (JSON.parse(readFileSync(full, 'utf8')) as { payload: { article: Article } }).payload.article;
}

const image = (id: string) => ({ id, image_url: `https://example.org/${id}.jpg`, caption: id });

describe('buildSections (FR-D2)', () => {
  it('payload #1 has the 13 tabs in the specified order, with no extra tab for overview_images', () => {
    const sections = buildSections(loadArticle('001_passive_seismometer_payload.json'));
    expect(sections.map((s) => s.label)).toEqual([
      'Overview',
      'Description',
      'Scientific Purpose & Applications',
      'Operating Principle',
      'Scientific Importance',
      'Physical Specifications',
      'Environment & Operations',
      'Limitations',
      'Transportation & Deployment',
      'Historical Significance',
      'Uncertainties',
      'Images',
      'References',
    ]);
  });

  it('attaches overview_images to the Overview tab', () => {
    const sections = buildSections(loadArticle('001_passive_seismometer_payload.json'));
    expect(sections[0]?.images).toHaveLength(3);
    expect(sections.find((s) => s.slug === 'images')?.images).toBeNull();
  });

  it('keeps unknown keys as generic tabs, placed before Images', () => {
    const sections = buildSections(loadArticle('013_fluxgate_magnetometer_payload.json'));
    const labels = sections.map((s) => s.label);
    expect(labels).toContain('Scope note');
    expect(labels.indexOf('Scope note')).toBeLessThan(labels.indexOf('Images'));
  });

  it('skips null and empty values', () => {
    const sections = buildSections({ overview: 'Text', description: null, limitations: '', references: [] });
    expect(sections.map((s) => s.key)).toEqual(['overview']);
  });

  it('attaches a section image list instead of showing it as a tab', () => {
    const sections = buildSections({
      overview: 'Text',
      overview_images: [image('a')],
    });
    expect(sections.map((s) => s.key)).toEqual(['overview']);
    expect(sections[0]?.images?.[0]?.id).toBe('a');
  });

  it('keeps a *_images list as a tab when its section does not exist', () => {
    const sections = buildSections({ mystery_images: [image('x')] });
    expect(sections.map((s) => s.key)).toEqual(['mystery_images']);
    expect(sections[0]?.kind).toBe('generic');
  });

  it('assigns the renderer kind by key', () => {
    const sections = buildSections({
      physical_specifications: { examples: [] },
      transportation_and_deployment: { overview: 'x' },
      images: [image('i')],
      references: [{ url: 'https://example.org' }],
    });
    expect(sections.map((s) => s.kind)).toEqual(['physical', 'transport', 'gallery', 'references']);
  });
});

describe('slugFor', () => {
  it('uses short slugs for long keys', () => {
    expect(slugFor('scientific_purpose_and_applications')).toBe('purpose');
    expect(slugFor('operating_principle')).toBe('operating-principle');
  });
});

describe('attachedImageKeys', () => {
  it('maps each section to its *_images key only when the section exists', () => {
    const map = attachedImageKeys({ overview: 'x', overview_images: [image('a')], orphan_images: [image('b')] });
    expect([...map.entries()]).toEqual([['overview', 'overview_images']]);
  });
});

describe('featureImages', () => {
  it('prefers overview_images, then images, then nothing', () => {
    expect(featureImages({ overview_images: [image('o')], images: [image('i')] })[0]?.id).toBe('o');
    expect(featureImages({ images: [image('i')] })[0]?.id).toBe('i');
    expect(featureImages({})).toEqual([]);
  });
});

describe('isEmptyValue', () => {
  it('treats null, empty strings, empty arrays and empty objects as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue({})).toBe(true);
    expect(isEmptyValue('x')).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
  });
});
