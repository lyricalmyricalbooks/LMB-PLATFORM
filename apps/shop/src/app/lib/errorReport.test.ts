import { describe, expect, it } from "vitest";
import { buildReport, fromShopCode, shouldIgnore } from "./errorReport";

describe("error reports", () => {
  it("keeps only the page path, never its query or fragment", () => {
    const r = buildReport("page", new Error("Cannot read x"), { path: "/track?orderId=1&key=secret#top", section: "Hero" });
    expect(r).toMatchObject({ kind: "page", message: "Cannot read x", path: "/track", section: "Hero" });
    expect(r.stack).toContain("Cannot read x");
  });
  it("accepts thrown strings and rejected values", () => {
    expect(buildReport("promise", "plain text", { path: "/" }).message).toBe("plain text");
    expect(buildReport("promise", undefined, { path: "" })).toMatchObject({ message: "", path: "/" });
  });
  it("ignores browser and network noise", () => {
    for (const m of ["Script error.", "ResizeObserver loop completed with undelivered notifications.", "Failed to fetch", "Load failed", ""]) expect(shouldIgnore(m)).toBe(true);
    expect(shouldIgnore("Cannot read properties of undefined (reading 'price')")).toBe(false);
  });
});

describe("which rejected promises count", () => {
  const origin = "https://shop.example";
  it("counts only Errors from the shop's own bundle", () => {
    const own = new Error("boom"); own.stack = `Error: boom\n    at f (${origin}/assets/index-abc.js:1:2)`;
    const other = new Error("Timeout"); other.stack = "Error: Timeout\n    at g (https://www.gstatic.com/recaptcha/x.js:1:2)";
    expect(fromShopCode(own, origin)).toBe(true);
    expect(fromShopCode(other, origin)).toBe(false);
    expect(fromShopCode("Timeout", origin)).toBe(false);
    expect(fromShopCode(undefined, origin)).toBe(false);
  });
});
