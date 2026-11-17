// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => new Proxy({} as Record<string, any>, {
  get: (t, k: string) => t[k] ?? (t[k] = async () => (k === "getAllBooks" ? [{ id: "b1", title: "Heavy Atlas", shippingProfileId: "heavy" }] : k.startsWith("get") ? null : undefined)),
}));
vi.mock("./api", () => ({ adminApi: api, inventoryApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { ShippingSettings } = await import("./ShopSettings");

const profiles = [
  { id: "general-profile", name: "General", zones: [{ id: "z1", name: "Canada", countries: ["CA"], rates: [{ id: "r1", name: "Standard", type: "flat", base: 8, additional: 3 }] }] },
  { id: "heavy", name: "Heavy books", zones: [] },
];

let root: Root | null = null;
async function mount() {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(ShippingSettings, { profiles, refreshProfiles: vi.fn(), initialView: "profiles" })); });
  return el;
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
const byText = (root: Element, sel: string, text: string) => [...root.querySelectorAll(sel)].find((b) => b.textContent?.trim() === text);

const input = async (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

describe("Settings › Shipping › Profiles workspace (Shipping Profiles v2 mockup)", () => {
  it("lists profiles in the rail with their books and first zones", async () => {
    const el = await mount();
    const rail = el.querySelector('[aria-label="Shipping profiles"]')!;
    expect(rail.textContent).toContain("Heavy books");
    expect(rail.textContent).toContain("Ships nowhere yet");
    expect(rail.textContent).toContain("1 book");
  });

  it("opens a profile with its books, zones and the Try it answer", async () => {
    const el = await mount();
    await click(byText(el, "button", "General0 books · defaultCanada"));
    expect((el.querySelector('[aria-label="Profile name"]') as HTMLInputElement).value).toBe("General");
    expect(el.querySelector(".spw-result")?.textContent).toContain("$8.00");
    await click(byText(el, "button", "Brazil"));
    expect(el.querySelector(".spw-result")?.textContent).toContain("Can't check out");
  });

  it("shows a gap banner, then a Save bar after an edit, and Discard puts it back", async () => {
    const el = await mount();
    await click(byText(el, "button", "Heavy books1 bookShips nowhere yet"));
    expect(el.textContent).toContain("Some customers can't buy these books");
    expect(el.textContent).toContain("Heavy Atlas");
    await click(byText(el, "button", "Add “Everywhere else”"));
    expect(el.querySelector('[aria-label="Unsaved shipping changes"]')).not.toBeNull();
    await click(byText(el, "button", "Discard"));
    expect(el.querySelector('[aria-label="Unsaved shipping changes"]')).toBeNull();
  });

  it("refuses to save a zone with no price, and saves a fixed one", async () => {
    const el = await mount();
    await click(byText(el, "button", "Heavy books1 bookShips nowhere yet"));
    await click(byText(el, "button", "Add “Everywhere else”"));
    await click(byText(el, "button", "Save"));
    expect(el.textContent).toContain("Enter the first-book price (0 for free).");
    api.updateShippingProfile = vi.fn(async () => ({}));
    await input(el.querySelector(".spw-zone input[inputmode=decimal]") as HTMLInputElement, "12");
    await click(byText(el, "button", "Save"));
    expect(api.updateShippingProfile).toHaveBeenCalledWith("heavy", expect.objectContaining({ zones: [expect.objectContaining({ restOfWorld: true, rates: [expect.objectContaining({ base: 12 })] })] }));
  });
});
