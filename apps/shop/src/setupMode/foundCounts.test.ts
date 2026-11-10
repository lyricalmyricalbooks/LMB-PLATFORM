import { describe, expect, it } from "vitest";
import { foundCounts } from "./foundCounts";
import type { ImportPlan, ImportRow } from "../app/admin/catalogImport";

const row = (line: number, action: ImportRow["action"], patch: Record<string, any>): ImportRow => ({ line, action, title: `Item ${line}`, patch, changes: [], warnings: [], errors: [] });
const plan = (rows: ImportRow[], problems: string[] = []): ImportPlan => ({ rows, ignoredColumns: [], problems, counts: { create: rows.filter((r) => r.action === "create").length, update: 0, unchanged: 0, error: 0 } });

describe("what reading an old shop found", () => {
  it("counts the products, photos, stocked products and old links that would come in", () => {
    const counts = foundCounts(plan([
      row(2, "create", { photos: [{ url: "https://a.example/1.jpg" }, { url: "https://a.example/2.jpg" }], stockLevel: 3 }),
      row(3, "create", { photos: [], variants: [{ stock: 0 }, { stock: 2 }] }),
      row(4, "create", { stockLevel: 0 }),
      row(5, "error", { photos: [{ url: "https://a.example/3.jpg" }], stockLevel: 9 }),
    ]), new Map([[2, ["/products/a", "/products/a"]], [3, ["/products/b"]], [5, ["/products/c"]]]));
    expect(counts).toEqual({ products: 3, photos: 2, inStock: 2, oldLinks: 2 });
  });

  it("finds nothing when the file can't come in at all", () => {
    expect(foundCounts(plan([row(2, "create", { stockLevel: 1 })], ["No title column"]), new Map())).toEqual({ products: 0, photos: 0, inStock: 0, oldLinks: 0 });
  });
});
