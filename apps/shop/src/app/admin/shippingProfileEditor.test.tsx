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

describe("Settings › Shipping › profiles (Masthead layout)", () => {
  it("lists profiles as one ruled list with Edit and a ⋯ menu, no eyebrow or description", async () => {
    const el = await mount();
    expect(el.querySelector('[aria-label="Shipping profiles"]')?.textContent).toContain("Heavy books");
    expect(el.querySelector(".rp-kicker, .rp-section-kicker, .rp-card-desc")).toBeNull();
    expect(el.textContent).not.toContain("A profile is a set of zones");
  });

  it("opens a profile as a big title, underlined sub tabs and the same figures strip as Inventory", async () => {
    const el = await mount();
    await click(byText(el, "button", "General"));
    expect(el.querySelector("h2.rp-page-title")?.textContent).toBe("General");
    const tabs = [...el.querySelectorAll('[role="tablist"][aria-label="Profile"] [role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Zones & prices", "Rules", "Books", "Test"]);
    expect([...el.querySelectorAll(".rp-kpi-grid .rp-metric-label")].map((n) => n.textContent)).toEqual(["Zones", "Rates", "Countries", "Books"]);
    expect(el.textContent).not.toMatch(/\\d · (Where you ship|Rules for|Books that|Test this)/);
    expect(el.querySelector(".rp-card-desc")).toBeNull();
    // One panel at a time; the others stay mounted.
    expect(el.querySelector("#rp-panel-profile-zones")?.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector("#rp-panel-profile-test")?.hasAttribute("hidden")).toBe(true);
    await click(el.querySelector("#rp-tab-profile-test"));
    expect(el.querySelector("#rp-panel-profile-test")?.hasAttribute("hidden")).toBe(false);
    await click(byText(el, "button", "← Shipping profiles"));
    expect(el.querySelector('[aria-label="Shipping profiles"]')).not.toBeNull();
  });

  it("puts the name of a non-default profile on Name & rules and lists its books", async () => {
    const el = await mount();
    await click(byText(el, "button", "Heavy books"));
    expect(el.querySelector("#rp-tab-profile-rules")?.textContent).toBe("Name & rules");
    expect(el.querySelector("#rp-panel-profile-books")?.textContent).toContain("Heavy Atlas");
    if (process.env.SHOT_HTML) (await import("node:fs")).writeFileSync(process.env.SHOT_HTML, el.innerHTML);
  });
});
