// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inThemePreview, loadThemePreview, readPreviewRecord, resetThemePreview, THEME_PREVIEW_KEY, themePreviewToken } from "./themePreview";
import { ThemePreviewBanner } from "./ThemePreviewBanner";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const go = (search: string) => window.history.replaceState(null, "", `/shop/${search}`);
beforeEach(() => { sessionStorage.clear(); resetThemePreview(); go(""); });

describe("share preview links (3.4)", () => {
  it("reads the token from the link and keeps it for the visit", () => {
    expect(themePreviewToken()).toBeNull();
    go(`?themePreview=${TOKEN}`);
    expect(themePreviewToken()).toBe(TOKEN);
    expect(sessionStorage.getItem(THEME_PREVIEW_KEY)).toBe(TOKEN);
    go("books/night-pages");
    expect(inThemePreview()).toBe(true);
  });

  it("ignores malformed tokens and the Studio editor preview", () => {
    go("?themePreview=short");
    expect(themePreviewToken()).toBeNull();
    go(`?preview=true&themePreview=${TOKEN}`);
    expect(themePreviewToken()).toBeNull();
  });

  it("accepts only unexpired records with a design", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
    expect(readPreviewRecord({ design: { a: 1 }, name: "Autumn", expiresAt: ts("2026-10-10T00:00:00Z") }, now)).toMatchObject({ name: "Autumn", design: { a: 1 } });
    expect(readPreviewRecord({ design: { a: 1 }, expiresAt: ts("2026-10-09T11:00:00Z") }, now)).toBeNull();
    expect(readPreviewRecord({ name: "x", expiresAt: ts("2026-10-10T00:00:00Z") }, now)).toBeNull();
    expect(readPreviewRecord(null, now)).toBeNull();
  });

  it("loads once, and an unreadable link falls back to the live shop and forgets the token", async () => {
    go(`?themePreview=${TOKEN}`);
    const fetch = vi.fn(async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); });
    expect(await loadThemePreview(fetch)).toBeNull();
    expect(sessionStorage.getItem(THEME_PREVIEW_KEY)).toBeNull();
    await loadThemePreview(fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    go("books/night-pages");
    expect(inThemePreview()).toBe(false);
  });
});

describe("preview link banner", () => {
  let root: Root | null = null;
  afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });
  const mount = async () => {
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(h(MemoryRouter, null, h(ThemePreviewBanner))); });
  };

  it("names the shared design and offers Exit preview", async () => {
    go(`?themePreview=${TOKEN}`);
    await mount();
    await act(async () => { await loadThemePreview(async () => ({ name: "Autumn", design: { copy: { themePreviewExit: "Back to the shop" } }, expiresAt: { toMillis: () => Date.now() + 60_000 } })); });
    const banner = document.querySelector("[data-theme-preview-banner]")!;
    expect(banner.textContent).toContain("You're previewing “Autumn”");
    expect(banner.querySelector("button")!.textContent).toBe("Back to the shop");
  });

  it("says when a link has expired, and shows nothing without a link", async () => {
    await mount();
    expect(document.querySelector("[data-theme-preview-banner]")).toBeNull();
    await act(async () => root?.unmount()); document.body.innerHTML = "";
    go(`?themePreview=${TOKEN}`);
    await mount();
    await act(async () => { await loadThemePreview(async () => null); });
    expect(document.querySelector("[data-theme-preview-banner]")!.textContent).toContain("expired");
  });
});
