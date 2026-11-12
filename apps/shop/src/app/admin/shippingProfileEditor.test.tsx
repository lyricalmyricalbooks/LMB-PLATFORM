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

describe("Settings › Shipping › profiles (v4 form kit)", () => {
  it("lists profiles as one ruled list with Edit and a ⋯ menu, no eyebrow or description", async () => {
    const el = await mount();
    expect(el.querySelector('[aria-label="Shipping profiles"]')?.textContent).toContain("Heavy books");
    expect(el.querySelector(".rp-kicker, .rp-section-kicker, .rp-card-desc")).toBeNull();
    expect(el.textContent).not.toContain("A profile is a set of zones");
  });

  it("opens a profile as one form kit page: sections, zones with their rates, one status bar (v4 mockup 1f)", async () => {
    const el = await mount();
    await click(byText(el, "button", "General"));
    expect(el.querySelector("h1, h2")?.textContent).toBe("General");
    const sections = [...el.querySelectorAll(".rp-fk-section-title")].map((n) => n.textContent);
    expect(sections).toEqual(["How you charge", "Zones and rates", "Packing", "Books", "Try a checkout"]);
    // No sub tabs or figures strip any more: everything is on the one page.
    expect(el.querySelector('[role="tablist"][aria-label="Profile"]')).toBeNull();
    expect(el.querySelector(".rp-kpi-grid")).toBeNull();
    expect(el.querySelector('[aria-label="Rates for Canada"]')?.textContent).toContain("Standard");
    expect(el.querySelector('[role="region"][aria-label="Form status"]')?.textContent).toContain("All saved");
    await click(byText(el, "button", "← Shipping"));
    expect(el.querySelector('[aria-label="Shipping profiles"]')).not.toBeNull();
  });

  it("asks a non-default profile for its name and lists its books", async () => {
    const el = await mount();
    await click(byText(el, "button", "Heavy books"));
    expect(el.textContent).toContain("Profile name");
    expect(el.querySelector('[aria-label="Books that use this profile"]')?.textContent).toContain("Heavy Atlas");
    if (process.env.SHOT_HTML) (await import("node:fs")).writeFileSync(process.env.SHOT_HTML, el.innerHTML);
  });
});
