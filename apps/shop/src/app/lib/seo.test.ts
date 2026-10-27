import { describe, expect, it } from 'vitest';
import { jsonLdDocument } from './seo';

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
