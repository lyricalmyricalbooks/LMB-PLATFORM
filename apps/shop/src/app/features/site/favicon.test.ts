// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { applyFavicon, faviconFor } from "./favicon";

const BUILT_IN = `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">` +
  `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`;
const iconHrefs = () => Array.from(document.querySelectorAll("link[rel~='icon']")).map(l => l.getAttribute("href"));

describe("favicon", () => {
  beforeEach(() => { document.head.innerHTML = ""; });

  it("adds the shop's icon to a page that has none (e.g. Track order opened from an email)", () => {
    applyFavicon({ faviconUrl: "https://example.com/icon.png" });
    expect(iconHrefs()).toEqual(["https://example.com/icon.png"]);
  });

  it("updates the existing icon link instead of adding another", () => {
    applyFavicon({ faviconUrl: "https://example.com/a.png" });
    applyFavicon({ faviconUrl: "https://example.com/b.png" });
    expect(iconHrefs()).toEqual(["https://example.com/b.png"]);
  });

  it("keeps the built-in tab icons when no Studio picture is set", () => {
    document.head.innerHTML = BUILT_IN;
    applyFavicon({});
    applyFavicon(undefined);
    expect(iconHrefs()).toEqual(["/favicon.ico", "/favicon-16.png", "/favicon-32.png"]);
  });

  it("replaces every built-in tab icon with the Studio picture, and brings them back when it is cleared", () => {
    document.head.innerHTML = BUILT_IN;
    applyFavicon({ faviconUrl: "https://example.com/icon.png" });
    expect(iconHrefs()).toEqual(["https://example.com/icon.png"]);
    expect(document.querySelector("link[rel='apple-touch-icon']")).not.toBeNull();
    applyFavicon({ faviconUrl: "" });
    expect(iconHrefs()).toEqual(["/favicon.ico", "/favicon-16.png", "/favicon-32.png"]);
  });

  it("falls back to favicon.ico when a page prerendered with a Studio picture has it cleared", () => {
    document.head.innerHTML = `<link rel="icon" data-fm-favicon="" href="https://example.com/old.png">`;
    applyFavicon({});
    expect(iconHrefs()).toEqual(["/favicon.ico"]);
  });

  it("uses the catalog page's own icon when one is set there", () => {
    expect(faviconFor({ faviconUrl: "https://x/root.png", storefront: { faviconUrl: "https://x/shop.png" } })).toBe("https://x/shop.png");
    expect(faviconFor({ faviconUrl: " https://x/root.png " })).toBe("https://x/root.png");
  });
});
