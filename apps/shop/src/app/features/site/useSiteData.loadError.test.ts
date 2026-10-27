// @vitest-environment jsdom
// #80: a failed Firestore read is an error with Retry, never "not found" (and never noindex).
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getStorefrontBooks: vi.fn(), getPublicSettings: vi.fn(), getPublishedPages: vi.fn(), recordVisit: vi.fn() }));
vi.mock("../../lib/publicApi", () => ({ publicApi: api }));
vi.mock("./customCode", () => ({ applyCustomCode: vi.fn() }));
let root: ReturnType<typeof createRoot>;
let useSiteData: typeof import("./useSiteData").useSiteData;
let latest: ReturnType<typeof useSiteData>;
function Consumer() { latest = useSiteData(); return h("span", null, latest.books.length); }
const render = async () => act(async () => { root.render(h(MemoryRouter, null, h(Consumer))); });

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("BroadcastChannel", class { close() {} });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  api.getPublicSettings.mockResolvedValue({ design: {} });
  api.getPublishedPages.mockResolvedValue([]);
  api.recordVisit.mockResolvedValue(undefined);
  ({ useSiteData } = await import("./useSiteData"));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("a failed first load reports an error and is not treated as a fresh (empty) answer", async () => {
  api.getStorefrontBooks.mockRejectedValue(new Error("blocked"));
  await render();
  expect(latest.loadError).toBe(true);
  expect(latest.fresh).toBe(false); // pages keep "loading", never turn into a 404 + noindex
  expect(latest.loading).toBe(false);
  expect(latest.books).toHaveLength(0);
});

it("Retry reads again and clears the error", async () => {
  api.getStorefrontBooks.mockRejectedValueOnce(new Error("blocked")).mockResolvedValue([{ id: "one", title: "A book", slug: "a-book" }]);
  await render();
  expect(latest.loadError).toBe(true);
  await act(async () => { latest.retry(); });
  expect(latest.loadError).toBe(false);
  expect(latest.fresh).toBe(true);
  expect(latest.books).toHaveLength(1);
  expect(api.getStorefrontBooks).toHaveBeenCalledTimes(2);
});

it("a successful load has no error", async () => {
  api.getStorefrontBooks.mockResolvedValue([]);
  await render();
  expect(latest.loadError).toBe(false);
  expect(latest.fresh).toBe(true);
});
