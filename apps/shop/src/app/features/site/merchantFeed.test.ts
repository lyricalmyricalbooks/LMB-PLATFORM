import { describe, expect, it } from "vitest";
import { bookCreators } from "../../lib/bookSeo";
// @ts-ignore - plain ESM shared with the build script
import { creatorNames, merchantFeedItems, merchantFeedXml, releaseArrived as feedRelease, stockOf, bundleStock, unitPrice, preorderDate } from "./merchantFeed.mjs";
// @ts-ignore - plain ESM build helper
import { releaseArrived as buildRelease } from "../../../../scripts/publicStorefrontData.mjs";
// @ts-ignore - CommonJS server modules
import * as priceMod from "../../../../functions/catalogPrice.js";
// @ts-ignore
import * as preMod from "../../../../functions/shared/preorder.js";
// @ts-ignore
import * as promoMod from "../../../../functions/shared/promotions.js";
const server: any = { ...((priceMod as any).default ?? priceMod), ...((preMod as any).default ?? preMod), ...((promoMod as any).default ?? promoMod) };

// 2026-10-08 noon in Toronto.
const now = new Date("2026-10-08T16:00:00Z");
const SITE = "https://shop.test/sub";
const photo = (n: string) => [{ url: `https://img.test/${n}.jpg` }, { url: `https://img.test/${n}-back.jpg` }];

const catalog: any[] = [
  { id: "a", title: "Salt Hours", subtitle: "Zoe Moss", description: "<p>Poems &amp; tides</p>", isbn: "978-0-306-40615-7", retailPrice: 24, trackInventory: true, stockLevel: 3, photos: photo("a"), categories: ["Poetry"], publisher: "Lyrical Press" },
  { id: "b", title: "Sold Out", retailPrice: 10, trackInventory: true, stockLevel: 0, photos: photo("b") },
  { id: "c", title: "Backorder", retailPrice: 10, trackInventory: true, allowBackorder: true, stockLevel: 0, photos: photo("c") },
  { id: "d", title: "Sale", retailPrice: 30, isOnSale: true, salePrice: 20, saleStartsAt: "2026-10-01", saleEndsAt: "2026-12-31", photos: photo("d") },
  { id: "e", title: "Pre", retailPrice: 15, preorder: true, publishDate: "2026-11-12", trackInventory: true, stockLevel: 5, photos: photo("e") },
  { id: "f", title: "Editions", retailPrice: 0, trackInventory: true, photos: photo("f"), variants: [{ id: "pb", name: "Paperback", price: 18, stock: 2, isbn: "9781234567897" }, { id: "hc", name: "Hardcover", price: "", stock: 4 }] },
  { id: "g", title: "Draft", status: "draft", retailPrice: 10, photos: photo("g") },
  { id: "h", title: "Later", scheduleDate: "2026-10-09", retailPrice: 10, photos: photo("h") },
  { id: "i", title: "No photo", retailPrice: 10 },
  { id: "j", title: "Gift card", productType: "giftCard", retailPrice: 25, photos: photo("j") },
  { id: "k", title: "Hidden", seoNoindex: true, retailPrice: 10, photos: photo("k") },
  { id: "l", title: "Box set", retailPrice: 50, bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b" }], photos: photo("l") },
  { id: "m", title: "E-book", format: "EPUB", retailPrice: 9, photos: photo("m") },
];

describe("merchant feed rules match checkout", () => {
  it("prices, pre-orders and stock follow the server modules", () => {
    for (const book of catalog) {
      const variants = book.variants?.length ? book.variants : [null];
      for (const v of variants) {
        const a = unitPrice(book, v, now), b = server.catalogUnitPrice(book, v, now);
        expect(Number.isNaN(a) ? "NaN" : a).toEqual(Number.isNaN(b) ? "NaN" : b);
      }
      expect(preorderDate(book, now) !== null).toBe(server.preorderActive(book, now));
    }
    const get = (id: string) => catalog.find(b => b.id === id);
    expect(bundleStock(catalog[11], get)).toBe(server.bundleAvailable(catalog[11], get));
    expect(stockOf(catalog[0])).toBe(3);
    expect(stockOf(catalog[2])).toBe(Infinity);
  });
  it("release dates follow the build's rule", () => {
    for (const d of ["", "2026-10-08", "2026-10-09", "2026-10-08T17:00:00Z", "2026-10-08T15:00:00Z"]) {
      expect(feedRelease(d, now)).toBe(buildRelease(d, now.toISOString()));
    }
  });
});

describe("merchantFeedItems", () => {
  const { items, skipped } = merchantFeedItems(SITE, catalog, { now, shopName: "Lyricalmyrical Books" });
  const byId = Object.fromEntries(items.map((i: any) => [i.id, i]));

  it("lists only books shoppers can buy today", () => {
    expect(Object.keys(byId).sort()).toEqual(["a", "b", "c", "d", "e", "f_pb", "l", "m"]);
    expect(skipped.map((s: any) => s.reason)).toEqual(expect.arrayContaining(["This edition has no price", "No photo (Google requires one)", expect.stringMatching(/Hidden/)]));
  });

  it("describes a book the way Google expects", () => {
    expect(byId.a).toMatchObject({
      title: "Salt Hours by Zoe Moss", creators: ["Zoe Moss"], description: "Poems & tides", link: `${SITE}/books/salt-hours`, image: "https://img.test/a.jpg",
      additionalImages: ["https://img.test/a-back.jpg"], price: "24.00 CAD", availability: "in_stock", gtin: "9780306406157",
      brand: "Lyrical Press", productType: "Poetry", googleCategory: "Media > Books > Print Books", condition: "new",
    });
    expect(byId.m.googleCategory).toBe("Media > Books > E-books");
    expect(byId.b.availability).toBe("out_of_stock");
    expect(byId.c.availability).toBe("backorder");
    expect(byId.e).toMatchObject({ availability: "preorder", availabilityDate: "2026-11-12T00:00-05:00" });
    expect(byId.d).toMatchObject({ price: "30.00 CAD", salePrice: "20.00 CAD", saleDates: "2026-10-01T00:00-04:00/2026-12-31T23:59-05:00" });
    expect(byId.f_pb).toMatchObject({ groupId: "f", title: "Editions – Paperback", price: "18.00 CAD", gtin: "9781234567897", availability: "in_stock" });
    expect(byId.l).toMatchObject({ bundle: true, availability: "out_of_stock" });
  });

  it("writes valid, escaped RSS", () => {
    const xml = merchantFeedXml(SITE, [{ ...byId.a, title: "A & B <\u0001>" }, byId.b], { shopName: "Shop" });
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<title>A &amp; B &lt;&gt;</title>");
    expect(xml).toContain("<g:gtin>9780306406157</g:gtin>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(merchantFeedXml(SITE, [], { shopName: "Shop" })).toContain("<channel>");
  });
});

describe("artist names in the feed", () => {
  it("credits people the same way as the book page", () => {
    for (const book of [
      { subtitle: "Ian Willms" }, { subtitle: "A <b>One</b> &amp; B Two; C" }, { subtitle: "Various artists" },
      { subtitle: "Subverso Magazines x Lyricalmyrical Books" }, { authorName: "Legacy Name" }, { subtitle: "Ann and Bo + Cy" }, {},
    ]) expect(creatorNames(book)).toEqual(bookCreators(book as any));
  });
  it("puts the artist in the title once and lists them as Author", () => {
    const books = [
      { id: "h", title: "The Hound", subtitle: "Ian Willms", retailPrice: 60, photos: [{ url: "https://img.test/h.jpg" }] },
      { id: "o", title: "Ian Willms: Notes", subtitle: "Ian Willms", retailPrice: 10, photos: [{ url: "https://img.test/o.jpg" }] },
      { id: "v", title: "Collections #1", subtitle: "Various artists", retailPrice: 10, photos: [{ url: "https://img.test/v.jpg" }] },
    ];
    const { items } = merchantFeedItems("https://shop.test", books, { now: new Date("2026-10-18T12:00:00Z") });
    expect(items.map((i: any) => i.title)).toEqual(["The Hound by Ian Willms", "Ian Willms: Notes", "Collections #1"]);
    const xml = merchantFeedXml("https://shop.test", items);
    expect(xml).toContain("<g:product_detail><g:section_name>Book</g:section_name><g:attribute_name>Author</g:attribute_name><g:attribute_value>Ian Willms</g:attribute_value></g:product_detail>");
    expect(xml.match(/<g:product_detail>/g)).toHaveLength(2);
  });
});
