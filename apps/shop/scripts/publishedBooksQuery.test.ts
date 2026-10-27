import { expect, it } from 'vitest';
import { readPublishedBooks, publishedBooksQuery } from './publicStorefrontData.mjs';

it('reads books with a status == "published" query, paged by document name (firestore.rules serve only published books)', async () => {
  const name = (id: string) => `projects/p/databases/(default)/documents/books/${id}`;
  const rows = (ids: string[]) => ids.map(id => ({ document: { name: name(id), fields: { status: { stringValue: 'published' }, title: { stringValue: id } }, updateTime: 't' } }));
  const bodies: any[] = [];
  const fetchImpl = async (_url: string, init: any) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return { ok: true, json: async () => (body.structuredQuery.startAt ? rows(['c']) : rows(['a', 'b'])) };
  };
  const books = await readPublishedBooks('https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/', fetchImpl as any, 2);
  expect(books.map((b: any) => b.id)).toEqual(['a', 'b', 'c']);
  expect(bodies[0].structuredQuery.from).toEqual([{ collectionId: 'books' }]);
  expect(bodies[0].structuredQuery.where.fieldFilter).toEqual({ field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } });
  expect(bodies[1].structuredQuery.startAt).toEqual({ values: [{ referenceValue: name('b') }], before: false });
  expect(publishedBooksQuery().structuredQuery).not.toHaveProperty('startAt');
});

it('never lists the books collection unfiltered (the rules would refuse it)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./publicStorefrontData.mjs', import.meta.url), 'utf8');
  expect(source).not.toMatch(/collection\('books'\)/);
});
