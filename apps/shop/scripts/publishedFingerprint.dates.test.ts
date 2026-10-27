import { expect, it } from 'vitest';
import { publishedFingerprint, readApprovedReviews } from './publicStorefrontData.mjs';

// Fault #30: inputs that change what the build renders without any book/page/settings write.
const source = (): any => ({ books: [{ id: 'one', title: 'Book', status: 'published', stockLevel: 2 }], pages: [], settings: { design: {} }, reviews: [] });

it('changes when a scheduled sale starts or ends, or a pre-order reaches its publication day, with no document edit', () => {
  const sale = source(); Object.assign(sale.books[0], { isOnSale: true, salePrice: 5, retailPrice: 10, saleStartsAt: '2026-10-10', saleEndsAt: '2026-10-12' });
  const at = (iso: string) => publishedFingerprint(sale, iso);
  expect(at('2026-10-09T18:00:00Z')).not.toBe(at('2026-10-10T18:00:00Z'));
  expect(at('2026-10-10T18:00:00Z')).toBe(at('2026-10-11T18:00:00Z'));
  expect(at('2026-10-11T18:00:00Z')).not.toBe(at('2026-10-13T18:00:00Z'));
  const pre = source(); Object.assign(pre.books[0], { preorder: true, publishDate: '2026-10-20' });
  expect(publishedFingerprint(pre, '2026-10-19T18:00:00Z')).toBe(publishedFingerprint(pre, '2026-10-18T18:00:00Z'));
  expect(publishedFingerprint(pre, '2026-10-19T18:00:00Z')).not.toBe(publishedFingerprint(pre, '2026-10-20T18:00:00Z'));
});

it('follows Toronto calendar days, not UTC midnight, for sale windows', () => {
  const sale = source(); Object.assign(sale.books[0], { isOnSale: true, salePrice: 5, retailPrice: 10, saleStartsAt: '2026-10-10' });
  // 2026-10-10T02:00Z is still 9 Oct 22:00 in Toronto.
  expect(publishedFingerprint(sale, '2026-10-10T02:00:00Z')).toBe(publishedFingerprint(sale, '2026-10-09T15:00:00Z'));
  expect(publishedFingerprint(sale, '2026-10-10T05:00:00Z')).not.toBe(publishedFingerprint(sale, '2026-10-09T15:00:00Z'));
});

it('changes when a review is approved, edited, or leaves the approved set (JSON-LD aggregateRating)', () => {
  const data = source();
  const none = publishedFingerprint(data);
  data.reviews = [{ id: 'r1', bookId: 'one', status: 'approved', rating: 5, title: 'Great', body: 'Loved it', authorName: 'A', createdAt: 't' }];
  const one = publishedFingerprint(data);
  expect(one).not.toBe(none);
  data.reviews[0].rating = 4;
  expect(publishedFingerprint(data)).not.toBe(one);
  data.reviews[0].rating = 5; data.reviews[0].status = 'pending';
  expect(publishedFingerprint(data)).toBe(none);
});

it('reads approved reviews with a status == "approved" query, the only public read firestore.rules allow', async () => {
  const calls: any[] = [];
  const fetchImpl = async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, json: async () => [{ document: { name: 'projects/p/databases/(default)/documents/reviews/r1', fields: { status: { stringValue: 'approved' }, rating: { integerValue: '5' } }, updateTime: 't' } }] }; };
  const reviews = await readApprovedReviews('https://x/documents/', fetchImpl as any);
  const query = JSON.parse(calls[0].init.body).structuredQuery;
  expect(query.from).toEqual([{ collectionId: 'reviews' }]);
  expect(query.where.fieldFilter.value).toEqual({ stringValue: 'approved' });
  expect(reviews[0]).toMatchObject({ id: 'r1', rating: 5 });
});
