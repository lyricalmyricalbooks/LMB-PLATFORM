// The test shop's starter catalogue (docs/test-shop.md, plan 1.32): what setup step 12 adds to the platform's own test
// shop, on top of the release's starter documents. Every other shop gets none of it.
//
// - Shop: three printed books with 5 copies each (stock tracked), one pre-order, one e-book and one shipping zone.
// - Stockroom: the three printed books, 5 copies printed and none sold, so the stockroom shows 5 on hand.
// - Links: each printed shop book is linked to its stockroom book through the shop's own link (op "saveLinks"), so a
//   test purchase lowers both counts (release check 4).
//
// The shapes follow the shop copy (apps/shop/src/app/features/site/types.ts `Book`, `shipping-profiles` read by
// functions/orderMath.js) and the stockroom copy (apps/stockroom/src/main.js new-book form, settings/catalog). Titles say
// "Test" so nobody mistakes them for a press's books. Nothing here is a real book, person or price list.

export const TEST_STOCK = 5;

const PRINTED = Object.freeze([
  Object.freeze({ id: "test-book-one", title: "Test Book One", price: 20 }),
  Object.freeze({ id: "test-book-two", title: "Test Book Two", price: 25 }),
  Object.freeze({ id: "test-book-three", title: "Test Book Three", price: 30 }),
]);

/** The printed books' ids: the same id in the shop and in the stockroom. */
export const TEST_PRINTED_IDS = Object.freeze(PRINTED.map((book) => book.id));

const printedShopBook = ({ id, title, price }) => ({
  title,
  slug: id,
  status: "published",
  format: "Paperback",
  retailPrice: price,
  stockLevel: TEST_STOCK,
  trackInventory: true,
  weight: "300",
  categories: ["publications"],
  description: "A made-up book on the platform's test shop. Buying it moves test stock only.",
});

/** The shop documents: [{ path, data }], created only when missing (setup step 12). */
export function testShopDocs() {
  return [
    ...PRINTED.map((book) => ({ path: `books/${book.id}`, data: printedShopBook(book) })),
    {
      path: "books/test-pre-order",
      data: {
        title: "Test Pre-order",
        slug: "test-pre-order",
        status: "published",
        format: "Paperback",
        retailPrice: 22,
        stockLevel: TEST_STOCK,
        trackInventory: false,
        preorder: true,
        // Far ahead, so the book stays a pre-order (apps/shop/src/shared/preorder.ts).
        publishDate: "2099-01-01",
        categories: ["publications"],
        description: "A made-up pre-order on the platform's test shop.",
      },
    },
    {
      path: "books/test-e-book",
      data: {
        title: "Test E-book",
        slug: "test-e-book",
        status: "published",
        format: "E-book",
        digital: true,
        retailPrice: 10,
        stockLevel: 0,
        trackInventory: false,
        categories: ["publications"],
        description: "A made-up download on the platform's test shop.",
      },
    },
    {
      // One zone for the whole of Canada, at the shop's own rates (no carrier quotes needed).
      path: "shipping-profiles/test-canada",
      data: { name: "Canada", countries: ["CA"], continents: [], restOfWorld: false, base: 5, additional: 1, freeThreshold: 0 },
    },
  ];
}

/** The stockroom's books, keyed by id, as its catalogue keeps them. 5 printed and nothing sold means 5 on hand. */
export function testStockroomBooks(shop) {
  const currency = shop.currency === "CAD" ? "CA$" : shop.currency;
  return PRINTED.map(({ id, title, price }) => ({
    id,
    title,
    author: "Test Author",
    isbn: "—",
    maxPrint: TEST_STOCK,
    listPrice: price,
    currency,
    threshold: 1,
    productionCost: 0,
    urlParam: id,
  }));
}

/** Each printed shop book linked to the stockroom book with the same id: [{ shopBookId, stockroomBookId }]. */
export function testLinks() {
  return PRINTED.map(({ id }) => ({ shopBookId: id, stockroomBookId: id }));
}

/** Everything step 12 adds for the test shop. */
export function testCatalogue(shop) {
  return { shopDocs: testShopDocs(), stockroomBooks: testStockroomBooks(shop), links: testLinks() };
}
