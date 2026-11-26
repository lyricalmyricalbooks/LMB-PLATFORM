// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}) }));
vi.mock("./api", () => ({ adminApi: api }));
vi.mock("./inventoryLinkApi", () => ({ inventoryLinkApi: { state: async () => ({}) } }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
// A fresh copy each time: the shop's kinds of things are kept for the whole visit (productGroups.ts).
const mount = async (doc: any) => {
  vi.resetModules();
  const { WhatYouSellCard } = await import("./WhatYouSellCard");
  api.getFirstWeek.mockResolvedValue(doc);
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(WhatYouSellCard, { bare: true })));
  await flush();
};
const text = () => document.body.textContent || "";

describe("Settings › What you offer (shop types plan, part 2)", () => {
  it("names the shop's type on top", async () => {
    await mount({ publishes: "hair", sellsProducts: true, productGroups: ["beauty"] });
    expect(document.querySelector("[data-shop-type]")?.getAttribute("data-shop-type")).toBe("both");
    expect(text()).toContain("Products and services");
    expect(text()).toContain("What most customers come for");
  });

  it("shows no book tools to a shop that doesn't sell books", async () => {
    await mount({ publishes: "clothing", productGroups: ["clothing", "home"] });
    expect(document.querySelector("[data-book-tools]")).toBeNull();
    expect(text()).not.toMatch(/ISBN|royalt|author/i);
  });

  it("lets a shop that sells books turn the book tools off, after asking, without losing its kinds", async () => {
    await mount({ publishes: "books", productGroups: ["books", "art"] });
    const toggle = document.querySelector("[data-book-tools] [role=switch]") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    act(() => toggle.click());
    await flush();
    const yes = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Turn off") as HTMLButtonElement;
    await act(async () => { yes.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ sells: "prints" });
  });

  it("saves the lead side of a shop doing both", async () => {
    await mount({ publishes: "hair", sellsProducts: true });
    await act(async () => { (document.querySelector("[data-lead=products]") as HTMLButtonElement).click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ leadSide: "products" });
  });

  it("always has Something else, and saves the owner's own words (Julian, 26 November 2026)", async () => {
    await mount({ publishes: "other", productGroups: ["art"] });
    expect(document.querySelector("[data-group-other-words]")).toBeNull();
    act(() => (document.querySelector("[data-group-other]") as HTMLButtonElement).click());
    const box = document.querySelector("[data-group-other-words]") as HTMLInputElement;
    expect(box).not.toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setValue.call(box, "Surfboards"); box.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { box.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ otherSells: "Surfboards" });
  });

  it("asks a services shop on Other services what people book", async () => {
    await mount({ publishes: "services", otherService: "Dog grooming" });
    expect((document.querySelector("[data-other-service]") as HTMLInputElement).value).toBe("Dog grooming");
  });
});
