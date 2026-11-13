import { describe, expect, it } from "vitest";
import { WHOLE_SHOP, choiceProblem, choiceWords, isWhole, ordersInRange, partOf, pastDownloads, pickFiles } from "./takeoutChoice";

const files = [
  { path: "README.txt", content: "hi" },
  { path: "products/shopify-products.csv", content: "Handle,Title\nsalt,Salt Hours\n" },
  { path: "backup/books.json", content: "[]" },
  { path: "customers/customers.csv", content: "Email\na@example.com\n" },
  { path: "orders/orders.csv", content: "Id\n1\n" },
  { path: "images/images.csv", content: "x\n" },
  { path: "images/salt-1.jpg", content: new Uint8Array([1]) },
  { path: "pages/pages.json", content: "[]" },
  { path: "settings/settings.json", content: "{}" },
];

describe("choose what to download", () => {
  it("files fall into their parts; the README always goes", () => {
    expect(partOf("README.txt")).toBeNull();
    expect(partOf("backup/books.json")).toBe("products");
    expect(partOf("images/salt-1.jpg")).toBe("photos");
    expect(partOf("stockroom/stockroom.json")).toBe("stockroom");
  });
  it("keeps only the picked parts", () => {
    const kept = pickFiles(files, { parts: ["orders"], format: "csv" }).map((f) => f.path);
    expect(kept).toEqual(["README.txt", "orders/orders.csv"]);
    expect(pickFiles(files, WHOLE_SHOP)).toHaveLength(files.length);
  });
  it("turns spreadsheets into Excel files and leaves the rest", () => {
    const kept = pickFiles(files, { parts: ["products", "orders"], format: "xlsx" });
    expect(kept.map((f) => f.path)).toEqual(["README.txt", "products/shopify-products.xlsx", "backup/books.json", "orders/orders.xlsx"]);
    const x = kept[1].content as Uint8Array;
    expect([x[0], x[1]]).toEqual([0x50, 0x4b]);
  });
  it("narrows orders to the chosen shop days", () => {
    const orders = [{ createdAt: "2026-01-05" }, { createdAt: "2026-03-01" }, { createdAt: "2026-06-30" }, {}];
    expect(ordersInRange(orders)).toHaveLength(4);
    expect(ordersInRange(orders, "2026-02-01", "2026-06-30")).toEqual([{ createdAt: "2026-03-01" }, { createdAt: "2026-06-30" }]);
    expect(ordersInRange(orders, undefined, "2026-01-31")).toEqual([{ createdAt: "2026-01-05" }]);
  });
  it("says what's wrong with a choice", () => {
    expect(choiceProblem({ parts: [], format: "csv" })).toMatch(/at least one/);
    expect(choiceProblem({ parts: ["orders"], from: "2026-05-01", to: "2026-04-01", format: "csv" })).toMatch(/after/);
    expect(choiceProblem(WHOLE_SHOP)).toBeNull();
  });
  it("names the choice in plain words", () => {
    expect(isWhole(WHOLE_SHOP)).toBe(true);
    expect(choiceWords(WHOLE_SHOP)).toBe("The whole shop");
    expect(choiceWords({ parts: ["products", "orders"], from: "2026-01-01", to: "2026-03-31", format: "xlsx" })).toBe("Products, Orders (from 2026-01-01 to 2026-03-31), as Excel");
  });
  it("lists the last downloads, newest first", () => {
    const rows = [
      { type: "export", message: "Downloaded the whole shop: 2 products", createdAt: "2026-11-01T10:00:00Z" },
      { type: "settings", message: "Saved", createdAt: "2026-11-05T10:00:00Z" },
      { type: "export", message: "Downloaded part of the shop: Orders", createdAt: "2026-11-10T10:00:00Z" },
    ];
    expect(pastDownloads(rows).map((d) => d.words)).toEqual(["Downloaded part of the shop: Orders", "Downloaded the whole shop: 2 products"]);
  });
});
