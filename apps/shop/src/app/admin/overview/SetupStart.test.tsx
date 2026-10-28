// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}) }));
const store = vi.hoisted(() => {
  class ThemeConflictError extends Error {}
  return {
    ThemeConflictError,
    openWorkspace: vi.fn(async () => ({ draft: { copy: { heroTitle: "Kept" } }, rev: 3, savedThemes: [] })),
    saveDraft: vi.fn(async () => 4),
  };
});
vi.mock("../api", () => ({ adminApi: api }));
vi.mock("../themeStore", () => store);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SetupStart } = await import("./SetupStart");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const settings = { info: { name: "Moth Press" }, design: { showUnderConstruction: true } };
const base = { books: [], orders: [], readiness: [], settings };
const mount = async (props: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(SetupStart, { ...base, ...props })));
  await flush();
  // The welcome loads lazily (it brings Studio's theme library): wait for it when the shop shows it.
  if (props.waitForWelcome !== false) {
    for (let i = 0; i < 200 && !document.querySelector("ul[aria-label='Suggested looks']") && /Opening the looks/.test(document.body.textContent || ""); i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    }
  }
};
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const text = () => document.body.textContent || "";

describe("Choose your look, then Set up your shop (plans 6.3, 6.9)", () => {
  it("an existing shop (no setup document) sees neither", async () => {
    api.getFirstWeek.mockResolvedValue(null);
    await mount({});
    expect(text()).toBe("");
  });

  it("a new shop sees the welcome first, with the press's name, suggestions and every look", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting", publishes: "zines", plan: "both" });
    await mount({});
    expect(text()).toContain("Welcome to Moth Press. Choose your look");
    expect(text()).not.toContain("Set up your shop");
    const suggested = [...document.querySelectorAll("ul[aria-label='Suggested looks'] strong")].map(s => s.textContent);
    expect(suggested[0]).toBe("Zine");
    expect(document.querySelectorAll("ul[aria-label='Every look'] li").length).toBeGreaterThan(5);
    expect(document.body.innerHTML).toContain("Moth Press in this look");
  });

  it("choosing applies the look to the draft once, records it, and then shows the guide", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting", publishes: "books", plan: "shop" });
    await mount({});
    await act(async () => { button("Use this look")!.click(); });
    await flush();
    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    const [, draft, rev] = store.saveDraft.mock.calls[0] as any[];
    expect(rev).toBe(3);
    expect(draft.themeLibraryPreset).toBe("press-imprint");
    expect(draft.themeBase.id).toBe("press-imprint");
    expect(draft.copy).toEqual({ heroTitle: "Kept" });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: { theme: "press-imprint", at: expect.any(String) } });
    expect(text()).toContain("Set up your shop");
    expect(text()).not.toContain("Choose your look.");
  });

  it("Skip takes the first suggestion and says so", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
    await mount({});
    await act(async () => { button("Skip for now")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: { theme: "press-riso-noir", at: expect.any(String), skipped: true } });
  });

  it("a failed save keeps the welcome up with a plain message", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
    store.saveDraft.mockRejectedValueOnce(new Error("offline"));
    await mount({});
    await act(async () => { button("Use this look")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(api.updateFirstWeek).not.toHaveBeenCalledWith(expect.objectContaining({ welcome: expect.anything() }));
    expect(text()).toContain("Choose your look");
  });

  it("the welcome never shows again once done; the guide shows three steps and saves its progress", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    await mount({});
    expect(text()).not.toContain("Choose your look.");
    expect(document.querySelectorAll("ol[aria-label='Next steps'] > li").length).toBe(3);
    expect(text()).toContain("Later (5)");
    expect(text()).toContain("0 of 8 done");
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ progress: { steps: expect.any(Array), done: [], at: expect.any(String) } });
  });

  it("Open your shop is refused while Ready to sell blocks, and takes the wall down once nothing does", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    const onSetWall = vi.fn(async () => true);
    const blockers = [{ id: "books", label: "No published books", detail: "", status: "block", tab: "catalog", action: "Open Books" }];
    await mount({ readiness: blockers, onSetWall });
    await act(async () => { (document.querySelector("details") as HTMLDetailsElement).open = true; });
    await act(async () => { button("Open your shop")!.click(); });
    expect(onSetWall).not.toHaveBeenCalled();
    expect(text()).toContain("No published books");
    act(() => root?.unmount()); document.body.innerHTML = "";
    await mount({ readiness: [], onSetWall });
    await act(async () => { button("Open your shop")!.click(); });
    await flush();
    expect(onSetWall).toHaveBeenCalledWith(false);
  });

  it("a read that fails offers Try again", async () => {
    api.getFirstWeek.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
    await mount({});
    expect(text()).toContain("couldn't be read");
    await act(async () => { button("Try again")!.click(); });
    await flush();
    expect(text()).toBe("");
  });
});
