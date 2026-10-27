// @vitest-environment jsdom
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
const render = async (count: number) => act(async () => {
  root.render(h(MemoryRouter, null, Array.from({ length: count }, (_, key) => h(Consumer, { key }))));
});
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("BroadcastChannel", class { close() {} });
  api.getStorefrontBooks.mockResolvedValue([{ id: "one", title: "A book", slug: "a-book" }]);
  api.getPublicSettings.mockResolvedValue({ design: {} });
  api.getPublishedPages.mockResolvedValue([]);
  api.recordVisit.mockResolvedValue(undefined);
  ({ useSiteData } = await import("./useSiteData"));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("shares bootstrap reads between the page, cart and other storefront consumers", async () => {
  await render(4);
  expect(latest.books).toHaveLength(1);
  expect(api.getStorefrontBooks).toHaveBeenCalledTimes(1);
  expect(api.getPublicSettings).toHaveBeenCalledTimes(1);
  expect(api.getPublishedPages).toHaveBeenCalledTimes(1);
});
it("reuses fresh data on navigation but refreshes after thirty seconds", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  await render(1); await render(0); await render(1);
  expect(api.getStorefrontBooks).toHaveBeenCalledTimes(1);
  now.mockReturnValue(32000);
  await render(0); await render(1);
  expect(api.getStorefrontBooks).toHaveBeenCalledTimes(2);
});
it("retries a failed request on the next mount", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  api.getStorefrontBooks.mockRejectedValueOnce(new Error("offline"));
  await render(1);
  expect(latest.loading).toBe(false);
  await render(0); await render(1);
  expect(latest.books).toHaveLength(1);
});
it("does not reparse the catalog cache during ordinary rerenders", async () => {
  await render(1);
  const parse = vi.spyOn(JSON, "parse");
  await render(1);
  expect(parse).not.toHaveBeenCalled();
});
it("keeps a pending bootstrap shared when a late consumer mounts", async () => {
  let finish: (books: any[]) => void;
  api.getStorefrontBooks.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await render(1); await render(4);
  expect(latest.loading).toBe(true);
  expect(api.getStorefrontBooks).toHaveBeenCalledTimes(1);
  await act(async () => finish!([{ id: "one", title: "A book" }]));
  expect(latest.loading).toBe(false);
  expect(latest.books).toHaveLength(1);
});
it("keeps cached books visible when background refresh fails", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await render(1); await render(0);
  now.mockReturnValue(32000);
  api.getStorefrontBooks.mockRejectedValueOnce(new Error("offline"));
  await render(1);
  expect(latest.loading).toBe(false);
  expect(latest.books).toHaveLength(1);
});
it("keeps an unsaved Studio snapshot when the shared backend load finishes", async () => {
  let finish: (books: any[]) => void;
  window.history.replaceState(null, "", "/?preview=true");
  api.getStorefrontBooks.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  try {
    await render(2);
    await act(async () => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: window, data: {
      type: "STUDIO_PREVIEW_STATE", design: { copy: { siteName: "Unsaved" } },
      settings: { design: {} }, books: [{ id: "draft", title: "Draft book" }], pages: [],
    } })));
    await act(async () => finish!([{ id: "live", title: "Live book" }]));
    expect(latest.books[0].id).toBe("draft");
    expect(latest.settings.design.copy.siteName).toBe("Unsaved");
    expect(api.recordVisit).not.toHaveBeenCalled();
  } finally {
    window.history.replaceState(null, "", "/");
    delete (window as any).__studioPreviewState;
    delete (window as any).__studioPreviewDesign;
  }
});
it("renders for shoppers whose browser has no BroadcastChannel", async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  delete (globalThis as any).BroadcastChannel;
  await render(1);
  expect(latest.books).toHaveLength(1);
  await render(0);
});
it("opens the cross-tab preview channel only inside a Studio preview", async () => {
  const opened: string[] = [];
  vi.stubGlobal("BroadcastChannel", class { constructor(name: string) { opened.push(name); } close() {} });
  await render(1); await render(0);
  expect(opened).toEqual([]);
  window.history.replaceState(null, "", "/?preview=true");
  try {
    await render(1); await render(0);
    expect(opened).toEqual(["site_preview_updates"]);
  } finally {
    window.history.replaceState(null, "", "/");
  }
});
it("survives a preview whose BroadcastChannel constructor throws", async () => {
  vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("blocked"); } });
  window.history.replaceState(null, "", "/?preview=true");
  try {
    await render(1);
    expect(latest.books).toHaveLength(1);
    await render(0);
  } finally {
    window.history.replaceState(null, "", "/");
  }
});
