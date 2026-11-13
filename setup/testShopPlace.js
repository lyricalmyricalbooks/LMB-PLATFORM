// Where the platform's own test shops live in the shared system (docs/shared-system.md, phase 8; docs/test-shop.md): two
// folders in the shared test project, each at an address of its own. Kept apart from setup/make-test-shop.js so the
// release check, the release runner and the hosted server can name them without loading the shop maker.
//
// - The book test shop (`test-press`) answers at the project's own address and sells books: authors, royalties and
//   ISBN show, as for every book shop.
// - The general test shop (`test-goods`) answers at a second Hosting site of the same project and sells other things
//   (sign-up's "Something else"): the admin uses general words and hides the book-only parts.
//
// - The US dollar test shop (`test-press-us`, 13 November 2026) is a second book shop at a third Hosting site, signed
//   up from the United States: every price, charge and report in it is in US dollars (tasks/todo/2026-11-13-shop-currency.md).
//
// Every update goes to all of them, and real shops only get a version that passed the release check on each.
import { sellsBooks } from "../shared/sells/sells.js";

export const TEST_PROJECT = "lmb-test-shop";

export const TEST_SHOPS = Object.freeze([
  Object.freeze({ shopId: "test-press", kind: "books", pressName: "Test Press", publishes: "books", site: TEST_PROJECT, address: `${TEST_PROJECT}.web.app` }),
  Object.freeze({ shopId: "test-goods", kind: "general", pressName: "Test Goods", publishes: "other", site: "lmb-test-goods", address: "lmb-test-goods.web.app" }),
  Object.freeze({ shopId: "test-press-us", kind: "books", pressName: "Test Press US", publishes: "books", site: "lmb-test-press-us", address: "lmb-test-press-us.web.app", country: "US", currency: "USD", timeZone: "America/Los_Angeles" }),
]);

/** The book test shop: the one every older tool and doc calls "the test shop". */
export const TEST_SHOP_ID = TEST_SHOPS[0].shopId;
export const TEST_SHOP_ADDRESS = TEST_SHOPS[0].address;

/** The Hosting sites of the test project besides its own (each test shop that doesn't answer at the project's address). */
export const EXTRA_TEST_SITES = Object.freeze(TEST_SHOPS.map((shop) => shop.site).filter((site) => site !== TEST_PROJECT));

/** The test shop with this id, or null. */
export const testShopPlace = (shopId) => TEST_SHOPS.find((shop) => shop.shopId === shopId) ?? null;

/** "books" or "general": which test shop a registry row (or shop) is, from what it sells. No answer is a book shop. */
export const testShopKind = (row) => (sellsBooks(row?.publishes ?? row?.sells ?? null) ? "books" : "general");
