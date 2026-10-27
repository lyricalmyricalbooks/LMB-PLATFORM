import { describe, it, expect, vi } from "vitest";

vi.mock("../../admin/api", () => ({ adminApi: {} }));

describe("readCachedDesign", () => {
  it("reads the site cache without throwing (regression: the whole storefront crashed)", async () => {
    const store: Record<string, string> = { };
    (globalThis as any).window = globalThis;
    (globalThis as any).location = { search: "" };
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    };
    const { readCachedDesign } = await import("./useSiteData");
    expect(() => readCachedDesign()).not.toThrow();
    expect(typeof readCachedDesign()).toBe("object");
  });
});
