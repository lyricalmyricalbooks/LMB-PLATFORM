// The test shops' starter catalogues (docs/test-shop.md, plan 1.32): what setup step 12 adds to the platform's own test
// shops (setup/testShopPlace.js), on top of the release's starter documents. Every other shop gets none of it.
//
// The book test shop (`books`):
// - Shop: three printed books with 5 copies each (stock tracked), one pre-order, one e-book, one shirt in sizes and
//   colours and one shipping zone.
// - Stockroom: the three printed books, 5 copies printed and none sold, so the stockroom shows 5 on hand.
// The general test shop (`general`, a shop that sells no books):
// - Shop: a tote bag, an art print and a mug with 5 each (stock tracked), a T-shirt in three sizes and two colours, a
//   download, a sticker pack nearly sold out, a sold-out pin and one shipping zone.
// - Stockroom: the tote bag, the print and the mug, 5 made and none sold.
// In both:
// - Links: each stocked shop item is linked to its stockroom item through the shop's own link (op "saveLinks"), so a
//   test purchase lowers both counts (release check 4). The first stocked item is the one the release check buys.
//
// The shapes follow the shop copy (apps/shop/src/app/features/site/types.ts `Book`, `shipping-profiles` read by
// functions/orderMath.js) and the stockroom copy (apps/stockroom/src/main.js new-book form, settings/catalog). Names say
// "Test" so nobody mistakes them for a real shop's products. Nothing here is a real book, product, person or price list.
import { testShopKind } from "./testShopPlace.js";

export const TEST_STOCK = 5;

const PRINTED = Object.freeze([
  Object.freeze({ id: "test-book-one", title: "Test Book One", price: 20 }),
  Object.freeze({ id: "test-book-two", title: "Test Book Two", price: 25 }),
  Object.freeze({ id: "test-book-three", title: "Test Book Three", price: 30 }),
]);

/** The printed books' ids: the same id in the shop and in the stockroom. */
export const TEST_PRINTED_IDS = Object.freeze(PRINTED.map((book) => book.id));

// The general test shop's stocked goods, linked to the stockroom like the printed books.
const GOODS = Object.freeze([
  Object.freeze({ id: "test-tote-bag", title: "Test Tote Bag", price: 24, kind: "other", weight: "200" }),
  Object.freeze({ id: "test-art-print", title: "Test Art Print", price: 30, kind: "art", weight: "250" }),
  Object.freeze({ id: "test-mug", title: "Test Mug", price: 18, kind: "other", weight: "450" }),
]);

/** The general test shop's stocked goods' ids: the same id in the shop and in the stockroom. */
export const TEST_GOODS_IDS = Object.freeze(GOODS.map((item) => item.id));

/** The stocked, linked items of a test shop's kind ("books" or "general"). */
const stockedOf = (kind) => (kind === "general" ? GOODS : PRINTED);

/** The ids of a test shop's stocked, linked items. The first is the one the release check buys. */
export const stockedIds = (kind = "books") => (kind === "general" ? TEST_GOODS_IDS : TEST_PRINTED_IDS);

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

/** The general test shop's stocked item, as the shop keeps it. */
const stockedGood = ({ id, title, price, kind, weight }) => ({
  title,
  slug: id,
  status: "published",
  kind,
  retailPrice: price,
  stockLevel: TEST_STOCK,
  trackInventory: true,
  weight,
  categories: ["goods"],
  description: "A made-up product on the platform's general test shop. Buying it moves test stock only.",
});

/** The general test shop's documents: [{ path, data }]. */
function goodsShopDocs() {
  return [
    ...GOODS.map((item) => ({ path: `books/${item.id}`, data: stockedGood(item) })),
    {
      // Sizes and colours, each with its own stock.
      path: "books/test-goods-t-shirt",
      data: {
        title: "Test Logo T-shirt",
        slug: "test-goods-t-shirt",
        status: "published",
        kind: "clothing",
        retailPrice: 32,
        stockLevel: 12,
        trackInventory: true,
        weight: "250",
        categories: ["clothing"],
        description: "A made-up shirt on the platform's general test shop, in three sizes and two colours.",
        options: [{ name: "Size", values: ["S", "M", "L"] }, { name: "Colour", values: ["Black", "Natural"] }],
        variants: ["S", "M", "L"].flatMap((size) => ["Black", "Natural"].map((colour) => [size, colour])).map(([size, colour], i) => ({
          id: `test-goods-t-shirt-${i + 1}`,
          name: `${size} / ${colour}`,
          options: { Size: size, Colour: colour },
          price: 32,
          stock: 2,
          stockLevel: 2,
          sku: `TEST-LOGO-${size}-${colour.toUpperCase()}`,
        })),
      },
    },
    {
      path: "books/test-pattern-download",
      data: {
        title: "Test Pattern Download",
        slug: "test-pattern-download",
        status: "published",
        kind: "other",
        digital: true,
        retailPrice: 8,
        stockLevel: 0,
        trackInventory: false,
        categories: ["goods"],
        description: "A made-up download on the platform's general test shop.",
      },
    },
    {
      // Nearly sold out, so the low-stock list has something on it.
      path: "books/test-sticker-pack",
      data: {
        title: "Test Sticker Pack",
        slug: "test-sticker-pack",
        status: "published",
        kind: "other",
        retailPrice: 6,
        stockLevel: 1,
        trackInventory: true,
        weight: "30",
        categories: ["goods"],
        description: "A made-up sticker pack on the platform's general test shop, nearly sold out.",
      },
    },
    {
      // Sold out, so the sold-out label shows.
      path: "books/test-enamel-pin",
      data: {
        title: "Test Enamel Pin",
        slug: "test-enamel-pin",
        status: "published",
        kind: "jewelry",
        retailPrice: 12,
        stockLevel: 0,
        trackInventory: true,
        weight: "20",
        categories: ["goods"],
        description: "A made-up pin on the platform's general test shop, sold out.",
      },
    },
    canadaZone(),
  ];
}

// One zone for the whole of Canada, at the shop's own rates (no carrier quotes needed).
const canadaZone = () => ({
  path: "shipping-profiles/test-canada",
  data: { name: "Canada", countries: ["CA"], continents: [], restOfWorld: false, base: 5, additional: 1, freeThreshold: 0 },
});

/** The shop documents of a test shop's kind: [{ path, data }], created only when missing (setup step 12). */
export function testShopDocs(kind = "books") {
  if (kind === "general") return goodsShopDocs();
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
      // Merchandise that isn't a book (plan 10.7): a shirt in two sizes and two colours, each with its own stock. Only in
      // the shop (it has no stockroom book and no link), so the release checks on the printed books are unchanged.
      path: "books/test-t-shirt",
      data: {
        title: "Test T-shirt",
        slug: "test-t-shirt",
        status: "published",
        kind: "clothing",
        retailPrice: 28,
        stockLevel: 8,
        trackInventory: true,
        weight: "250",
        categories: ["merchandise"],
        description: "A made-up shirt on the platform's test shop, to show sizes and colours. Buying it moves test stock only.",
        options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }],
        variants: [
          ["S", "Black"], ["S", "White"], ["M", "Black"], ["M", "White"],
        ].map(([size, colour], i) => ({
          id: `test-t-shirt-${i + 1}`,
          name: `${size} / ${colour}`,
          options: { Size: size, Colour: colour },
          price: 28,
          stock: 2,
          stockLevel: 2,
          sku: `TEST-TSHIRT-${size}-${colour.toUpperCase()}`,
        })),
      },
    },
    canadaZone(),
  ];
}

/** The stockroom's items, keyed by id, as its catalogue keeps them. 5 made and nothing sold means 5 on hand. */
export function testStockroomBooks(shop) {
  const currency = shop.currency === "CAD" ? "CA$" : shop.currency === "USD" ? "US$" : shop.currency;
  const kind = testShopKind(shop);
  return stockedOf(kind).map(({ id, title, price }) => ({
    id,
    title,
    author: kind === "general" ? "Test Maker" : "Test Author",
    isbn: "—",
    maxPrint: TEST_STOCK,
    listPrice: price,
    currency,
    threshold: 1,
    productionCost: 0,
    urlParam: id,
  }));
}

/** Each stocked shop item linked to the stockroom item with the same id: [{ shopBookId, stockroomBookId }]. */
export function testLinks(kind = "books") {
  return stockedOf(kind).map(({ id }) => ({ shopBookId: id, stockroomBookId: id }));
}

/** Everything step 12 adds for a test shop, by what it sells (setup/testShopPlace.js testShopKind). */
export function testCatalogue(shop) {
  const kind = testShopKind(shop);
  return { shopDocs: testShopDocs(kind), stockroomBooks: testStockroomBooks(shop), links: testLinks(kind) };
}
