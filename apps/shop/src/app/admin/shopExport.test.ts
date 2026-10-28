// Plan 7.18: "Download for another shop system". The files use the layouts most shop systems read, and a round trip
// through this shop's own importer (shopMove.ts) gives back the same books, editions and customers.
import { describe, expect, it } from "vitest";
import { CUSTOMER_HEADINGS, PRODUCT_HEADINGS, customersForAnotherShop, descriptionToHtml, productsForAnotherShop } from "./shopExport";
import { htmlToDescription, planShopMove, readCustomerExport, readProductExport } from "./shopMove";
import { parseCsv } from "./catalogImport";

const NOW = new Date("2026-10-28T12:00:00Z");
const BOOKS = [
  {
    id: "b1", title: "Moths of the North", slug: "moths", description: "A **field** guide, *pocket* size.\n\n## Inside\n\n- 120 moths\n- Night maps\n\nSee [the notes](https://moth.example/n?a=1&b=2).",
    retailPrice: 30, isOnSale: true, salePrice: 24, stockLevel: 7, trackInventory: true, sku: "MOTH-1", isbn: "9780306406157", weight: "350 g",
    categories: ["Nature"], tags: ["field", "moths"], status: "published", metaTitle: "Moths", publisher: "Moth Press",
    photos: [{ url: "https://img.example/a.jpg", altText: "Cover" }, { url: "https://img.example/b.jpg" }, { url: "https://img.example/c.jpg" }],
  },
  {
    id: "b2", title: "Night Zine", retailPrice: 10, trackInventory: true, status: "draft", weight: "0.1 kg",
    variants: [
      { id: "v1", name: "Paperback", price: 10, stock: 3, sku: "Z-P" },
      { id: "v2", name: "Signed copy", price: 15, stock: 1, sku: "Z-S", photoUrl: "https://img.example/s.jpg" },
    ],
    photos: [{ url: "https://img.example/z.jpg" }],
  },
  // Same title as another book: the handle stays unique.
  { id: "b3", title: "Night Zine", slug: "", retailPrice: 12, stockLevel: 0, trackInventory: true, status: "archived" },
  { id: "g1", title: "Gift card", productType: "giftCard", retailPrice: 25 },
];

describe("books for another shop system", () => {
  const csv = productsForAnotherShop(BOOKS, { vendor: "Moth Press", now: NOW });
  const rows = parseCsv(csv);
  const at = (row: string[], h: (typeof PRODUCT_HEADINGS)[number]) => row[PRODUCT_HEADINGS.indexOf(h)];

  it("one line per edition, extra photos on lines of their own, gift cards left out", () => {
    expect(rows[0]).toEqual([...PRODUCT_HEADINGS]);
    expect(rows.slice(1).map((r) => [at(r, "Handle"), at(r, "Title"), at(r, "Option1 Value"), at(r, "Variant Price"), at(r, "Image Src")])).toEqual([
      ["moths", "Moths of the North", "Default Title", "24.00", "https://img.example/a.jpg"],
      ["moths", "", "", "", "https://img.example/b.jpg"],
      ["moths", "", "", "", "https://img.example/c.jpg"],
      ["night-zine", "Night Zine", "Paperback", "10.00", "https://img.example/z.jpg"],
      ["night-zine", "", "Signed copy", "15.00", ""],
      ["night-zine-2", "Night Zine", "Default Title", "12.00", ""],
    ]);
    const first = rows[1];
    expect([at(first, "Variant Compare At Price"), at(first, "Variant Grams"), at(first, "Variant Barcode"), at(first, "Status"), at(first, "Published"), at(first, "Vendor"), at(first, "Image Alt Text")])
      .toEqual(["30.00", "350", "9780306406157", "active", "true", "Moth Press", "Cover"]);
    expect([at(rows[2], "Image Position"), at(rows[3], "Image Position")]).toEqual(["2", "3"]);
    expect(at(rows[4], "Status")).toBe("draft");
    expect(at(rows[6], "Status")).toBe("archived");
    expect(csv).not.toContain("Gift card");
  });

  it("never names another shop system in the file", () => {
    expect(csv.toLowerCase()).not.toMatch(/shopify|squarespace|woocommerce|etsy|big ?cartel|wix/);
  });

  it("comes back through this shop's importer as the same books and editions", () => {
    const moved = readProductExport(csv);
    expect(moved?.shape).toBe("handle-rows");
    const plan = planShopMove(csv, []).plan;
    expect(plan.problems).toEqual([]);
    const patches = plan.rows.map((r) => r.patch as any);
    expect(patches.map((p) => p.title)).toEqual(["Moths of the North", "Night Zine", "Night Zine"]);
    const [moths, zine, other] = patches;
    expect({ retail: moths.retailPrice, sale: moths.salePrice, onSale: moths.isOnSale, stock: moths.stockLevel, sku: moths.sku, isbn: moths.isbn, weight: moths.weight })
      .toEqual({ retail: 30, sale: 24, onSale: true, stock: 7, sku: "MOTH-1", isbn: "9780306406157", weight: "350 g" });
    expect(moths.description).toBe(BOOKS[0].description);
    expect(moths.categories).toEqual(["Nature"]);
    expect(moths.tags).toEqual(["field", "moths"]);
    expect(moths.photos.map((p: any) => p.url)).toEqual(["https://img.example/a.jpg", "https://img.example/b.jpg", "https://img.example/c.jpg"]);
    expect(zine.variants.map((v: any) => [v.name, v.price, v.stock, v.sku])).toEqual([["Paperback", 10, 3, "Z-P"], ["Signed copy", 15, 1, "Z-S"]]);
    expect(zine.variants[1].photoUrl).toBe("https://img.example/s.jpg");
    expect(zine.photos[0].url).toBe("https://img.example/z.jpg");
    expect({ retail: other.retailPrice, stock: other.stockLevel }).toEqual({ retail: 12, stock: 0 });
  });

  it("an untracked book leaves its stock empty, and a sale that has ended goes out at the full price", () => {
    const [, line] = parseCsv(productsForAnotherShop([{ id: "x", title: "Loose", retailPrice: 8, trackInventory: false, isOnSale: true, salePrice: 5, saleEndsAt: "2026-01-01" }], { now: NOW }));
    expect([at(line, "Variant Inventory Qty"), at(line, "Variant Price"), at(line, "Variant Compare At Price")]).toEqual(["", "8.00", ""]);
  });
});

describe("descriptions as HTML", () => {
  it("writes what the book editor writes, and reads back the same", () => {
    const text = "Line one\nline two\n\n### Small head\n\n> A quote\n\n---\n\nA <b>tag</b> & more";
    const html = descriptionToHtml(text);
    expect(html).toContain("<p>Line one<br>line two</p>");
    expect(html).toContain("&lt;b&gt;tag&lt;/b&gt; &amp; more");
    expect(htmlToDescription(html)).toBe(text);
  });
});

describe("customers for another shop system", () => {
  const order = (over: Record<string, any>) => ({
    id: "o", paymentStatus: "paid", total: 40, createdAt: "2026-09-01T12:00:00Z",
    customer: { name: "Rae Ann Reader", email: "Rae@Reader.example", phone: "416-555-0100", address: { street: "1 Moth Lane", unit: "Apt 2", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
    ...over,
  });
  const orders = [
    order({ id: "a" }),
    order({ id: "b", total: 20, createdAt: "2026-10-01T12:00:00Z" }),
    order({ id: "c", customer: { name: "Sam", email: "sam@reader.example" } }),
    order({ id: "d", customer: { name: "Opt Out", email: "gone@reader.example" } }),
    order({ id: "t", isTest: true, customer: { name: "Test", email: "test@reader.example" } }),
    order({ id: "u", paymentStatus: "unpaid", customer: { name: "Left", email: "cart@reader.example" } }),
  ];
  const consent = {
    subscribed: new Set(["rae@reader.example", "gone@reader.example", "fan@reader.example", "fan-gone@reader.example"]),
    optedOut: (email: string) => email.startsWith("gone@") || email.startsWith("fan-gone@"),
  };
  const notes = new Map([["sam@reader.example", { note: "Likes zines", tags: ["zines", "local"] }]]);
  const csv = customersForAnotherShop(orders, consent, notes);
  const rows = parseCsv(csv);
  const at = (row: string[], h: (typeof CUSTOMER_HEADINGS)[number]) => row[CUSTOMER_HEADINGS.indexOf(h)];
  const byEmail = new Map(rows.slice(1).map((r) => [at(r, "Email"), r]));

  it("uses the customer layout, one line per paying customer plus subscribers who haven't bought yet", () => {
    expect(rows[0]).toEqual([...CUSTOMER_HEADINGS]);
    expect([...byEmail.keys()].sort()).toEqual(["fan@reader.example", "gone@reader.example", "rae@reader.example", "sam@reader.example"]);
    const rae = byEmail.get("rae@reader.example")!;
    expect([at(rae, "First Name"), at(rae, "Last Name"), at(rae, "Default Address Address1"), at(rae, "Default Address Address2"), at(rae, "Default Address City"),
      at(rae, "Default Address Province Code"), at(rae, "Default Address Country Code"), at(rae, "Default Address Zip"), at(rae, "Phone"), at(rae, "Total Orders"), at(rae, "Total Spent")])
      .toEqual(["Rae", "Ann Reader", "1 Moth Lane", "Apt 2", "Toronto", "ON", "CA", "M5V 1A1", "416-555-0100", "2", "60.00"]);
  });

  it("says yes to email marketing only for people on the newsletter now", () => {
    const yes = [...byEmail].filter(([, r]) => at(r, "Accepts Email Marketing") === "yes").map(([e]) => e).sort();
    expect(yes).toEqual(["fan@reader.example", "rae@reader.example"]);
    expect(at(byEmail.get("gone@reader.example")!, "Accepts Email Marketing")).toBe("no");
    expect(at(byEmail.get("sam@reader.example")!, "Accepts Email Marketing")).toBe("no");
    expect(csv).not.toContain("fan-gone@");
    expect(csv).not.toContain("test@reader.example");
    expect(csv).not.toContain("cart@reader.example");
  });

  it("comes back through this shop's customer importer", () => {
    const back = readCustomerExport(csv);
    expect(back.problems).toEqual([]);
    const rae = back.customers.find((c) => c.email === "rae@reader.example")!;
    expect(rae).toMatchObject({ name: "Rae Ann Reader", place: "Toronto, ON, CA", acceptsEmail: true, orders: 2, spent: 60 });
    expect(back.customers.find((c) => c.email === "sam@reader.example")).toMatchObject({ acceptsEmail: false, note: "Likes zines", tags: ["zines", "local"] });
  });
});
