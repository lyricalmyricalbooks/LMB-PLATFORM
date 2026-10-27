// PR 10 (#83, #87, #86): the shopper bundle stays free of admin code, and the catalog is read in few round trips.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PAGE_SIZE, loadCatalog } from "../features/site/loadCatalog";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, rel), "utf8");
const imports = (src: string) => [...src.matchAll(/^\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/gm)].map(m => m[1]);

describe("storefront modules stay out of the admin bundle", () => {
  it("lib/commerce.ts (loaded on every shopper page) imports nothing from admin/", () => {
    expect(imports(read("commerce.ts")).filter(i => /admin\//.test(i))).toEqual([]);
    // Its admin-only order-note path is loaded on demand, as before.
    expect(read("commerce.ts")).toContain('await import("../admin/api")');
  });
  it("lib/publicApi.ts imports nothing statically from admin/ except the default settings", () => {
    expect(imports(read("publicApi.ts")).filter(i => /admin\//.test(i) && !/defaultSettings$/.test(i))).toEqual([]);
  });
  it("the /track page uses the Lite-SDK public API, not admin/api.ts", () => {
    const tracking = read("../features/site/OrderTracking.tsx");
    expect(imports(tracking).filter(i => /admin\/api/.test(i))).toEqual([]);
    expect(tracking).toContain("publicApi.getPublicOrder");
    expect(read("publicApi.ts")).toContain("getPublicOrder: async");
  });
});

describe("Firebase loads after the first screen", () => {
  // These run on every shopper page. A static import of Firestore Lite, Firebase or App Check puts ~50 KB (gzip)
  // back into the main script; they load on first use through lib/lite.ts instead.
  const shopperModules = ["commerce.ts", "publicApi.ts", "reviews.ts", "functionsBase.ts", "../features/site/BackInStockForm.tsx", "../../lib/authSession.ts"];
  it.each(shopperModules)("%s imports no Firebase SDK statically", file => {
    const runtime = imports(read(file).replace(/^\s*import type[^;]*;/gm, ""));
    expect(runtime.filter(i => /^firebase\/|firestoreLite|firebaseApp/.test(i))).toEqual([]);
  });
});

describe("catalog reads", () => {
  it("reads a mid-size catalog in one round trip instead of several serial pages", async () => {
    const book = (i: number) => ({ id: String(i), _lastDoc: { id: String(i) } });
    let calls = 0;
    const books = await loadCatalog(async (size) => { calls++; return Array.from({ length: Math.min(size, 250) }, (_, i) => book(i)); });
    expect(books).toHaveLength(250);
    expect(calls).toBe(1);
    expect(CATALOG_PAGE_SIZE).toBeGreaterThanOrEqual(250);
  });
});
