import { describe, expect, it } from 'vitest';
import { jsonLdDocument, ogLocale } from './seo';

describe('page structured data script', () => {
  it('keeps a single schema object as is', () => {
    const one = { '@context': 'https://schema.org', '@type': 'Book' };
    expect(jsonLdDocument(one)).toBe(one);
    expect(jsonLdDocument([one])).toBe(one);
  });
  it('combines several schema objects into one @graph', () => {
    const doc = jsonLdDocument([{ '@context': 'https://schema.org', '@type': 'Book' }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList' }]);
    expect(doc).toEqual({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Book' }, { '@type': 'BreadcrumbList' }] });
  });
});

describe('og:locale', () => {
  it('follows the shop: French shops fr_CA, US shops en_US, everyone else en_CA', () => {
    expect(ogLocale({ language: 'fr' }, 'US')).toBe('fr_CA');
    expect(ogLocale({}, 'US')).toBe('en_US');
    expect(ogLocale({}, 'CA')).toBe('en_CA');
    expect(ogLocale(null, '')).toBe('en_CA');
  });
});
