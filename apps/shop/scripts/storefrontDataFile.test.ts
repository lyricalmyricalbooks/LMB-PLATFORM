import { describe, expect, it } from "vitest";
import { decodeStrict, markerNewerThanFile, nanoTime, readStorefrontData, shippingProfilesDiffer } from "./storefrontDataFile.mjs";
import { nanoTime as browserNanoTime } from "../src/app/features/site/storefrontDataFile";

const base = "https://firestore.test/v1/projects/p/databases/(default)/documents";
const doc = (path: string, fields: Record<string, unknown>) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields });

describe("storefront data file (build side)", () => {
  it("decodes values exactly like the browser's Firestore read and refuses ones JSON can't carry", () => {
    expect(decodeStrict({ mapValue: { fields: { a: { integerValue: "3" }, b: { doubleValue: 1.5 }, c: { nullValue: null }, d: { arrayValue: { values: [{ stringValue: "x" }, { booleanValue: false }] } } } } }))
      .toEqual({ a: 3, b: 1.5, c: null, d: ["x", false] });
    expect(decodeStrict({ arrayValue: {} })).toEqual([]);
    expect(() => decodeStrict({ timestampValue: "2026-10-15T00:00:00Z" }, "createdAt")).toThrow(/createdAt/);
    expect(() => decodeStrict({ doubleValue: "NaN" })).toThrow();
  });

  it("reads settings, books and pages at one snapshot, in the browser's shapes", async () => {
    const calls: any[] = [];
    const fetchImpl = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      let out: unknown;
      if (url.endsWith(":batchGet")) out = [{ found: doc("settings/website", { info: { mapValue: { fields: { name: { stringValue: "Shop" } } } } }), readTime: "2026-10-15T03:49:48.748909Z" }];
      else if (body.structuredQuery.from[0].collectionId === "books") {
        const page = body.structuredQuery.startAt ? [doc("books/c", { title: { stringValue: "C" } })] : [doc("books/a", { id: { stringValue: "stale" }, title: { stringValue: "A" } }), doc("books/b", { title: { stringValue: "B" } })];
        out = page.map(d => ({ document: d, readTime: body.readTime }));
      } else if (body.structuredQuery.from[0].collectionId === "shipping-profiles") {
        out = [{ document: doc("shipping-profiles/general-profile", { name: { stringValue: "General" }, zones: { arrayValue: {} } }), readTime: body.readTime }];
      } else out = [{ document: doc("pages/about", { id: { stringValue: "own-id" }, order: { integerValue: "2" } }), readTime: body.readTime }];
      return { ok: true, json: async () => out } as any;
    };
    const data = await readStorefrontData(base, "p", fetchImpl as any, 2);
    expect(data.readTime).toBe("2026-10-15T03:49:48.748909Z");
    expect(data.settings).toEqual({ info: { name: "Shop" } });
    expect(data.books).toEqual([{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }]);
    // Pages keep a stored `id` field over the document id, exactly like getPublishedPages' { id, ...data }.
    expect(data.pages).toEqual([{ id: "own-id", order: 2 }]);
    expect(data.shippingProfiles).toEqual([{ id: "general-profile", name: "General", zones: [] }]);
    expect(calls.find(c => c.body.structuredQuery?.from[0].collectionId === "shipping-profiles").body.structuredQuery.orderBy[0].field.fieldPath).toBe("__name__");
    expect(calls.slice(1).every(c => c.body.readTime === "2026-10-15T03:49:48.748909Z")).toBe(true);
  });

  it("still writes the file without shipping profiles that can't be stored exactly", async () => {
    const fetchImpl = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      let out: unknown;
      if (url.endsWith(":batchGet")) out = [{ found: doc("settings/website", {}), readTime: "2026-10-15T03:49:48.748909Z" }];
      else if (body.structuredQuery.from[0].collectionId === "shipping-profiles") out = [{ document: doc("shipping-profiles/p", { updatedAt: { timestampValue: "2026-10-15T00:00:00Z" } }) }];
      else out = [];
      return { ok: true, json: async () => out } as any;
    };
    const data = await readStorefrontData(base, "p", fetchImpl as any);
    expect(data.books).toEqual([]);
    expect("shippingProfiles" in data).toBe(false);
  });

  it("notices a file whose shipping profiles no longer match Firestore", () => {
    const file = { v: 1, readTime: "2026-10-15T04:10:16Z", books: [], pages: [], settings: null, shippingProfiles: [{ id: "a", name: "A", zones: [{ rates: [1], countries: ["CA"] }] }] };
    expect(shippingProfilesDiffer(file, [{ zones: [{ countries: ["CA"], rates: [1] }], name: "A", id: "a" }])).toBe(false);
    expect(shippingProfilesDiffer(file, [{ id: "a", name: "A", zones: [{ rates: [2], countries: ["CA"] }] }])).toBe(true);
    expect(shippingProfilesDiffer(file, [])).toBe(true);
    expect(shippingProfilesDiffer({ ...file, shippingProfiles: undefined }, [])).toBe(false);
    expect(shippingProfilesDiffer(null, [])).toBe(false);
  });

  it("stops when a read fails, so no file is written", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) }) as any;
    await expect(readStorefrontData(base, "p", fetchImpl as any)).rejects.toThrow(/403/);
  });

  it("rebuilds only when the marker records a change after the deployed file's snapshot", () => {
    const file = { v: 1, readTime: "2026-10-15T04:10:16.353519Z", books: [], pages: [], settings: null };
    const marker = (changedAt: string) => ({ fields: { changedAt: { timestampValue: changedAt }, source: { stringValue: "books/a" } } });
    expect(markerNewerThanFile(marker("2026-10-15T04:10:16.353520Z"), file)).toBe(true); // one microsecond later
    expect(markerNewerThanFile(marker("2026-10-15T04:10:16.353519Z"), file)).toBe(false); // the snapshot itself
    expect(markerNewerThanFile(marker("2026-10-15T04:09:00Z"), file)).toBe(false);
    // No information never forces a rebuild (a build that can't write the file would otherwise rebuild forever).
    expect(markerNewerThanFile(null, file)).toBe(false);
    expect(markerNewerThanFile(marker("2026-10-16T00:00:00Z"), null)).toBe(false);
    expect(markerNewerThanFile(marker("2026-10-16T00:00:00Z"), { ...file, v: 2 })).toBe(false);
    expect(markerNewerThanFile(marker("2026-10-16T00:00:00Z"), "<html>")).toBe(false);
  });

  it("reads times the same way as the browser", () => {
    for (const t of ["2026-10-15T04:10:16.353519Z", "2026-10-15T04:10:16Z", "2026-10-15T04:10:16.1Z", "2026-10-15T04:10:16.123456789Z", "nope", "2026-10-15T04:10:16+01:00"]) {
      expect(nanoTime(t)).toBe(browserNanoTime(t));
    }
  });
});