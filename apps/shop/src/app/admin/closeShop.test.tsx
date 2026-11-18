// @vitest-environment jsdom
// The way out of Colophon (Julian, 12 and 18 November 2026: "where do i even close the shop? … make it easy with a button").
// Settings › Close shop is its own page: download, one Close shop button with a plain yes or no, what happens next,
// whatever state the plan is in. These tests fail if that path drops off again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let planNow: { plan: any; failed: boolean } = { plan: null, failed: false };
vi.mock("./platformPlanApi", () => ({ usePlatformPlan: () => planNow }));
vi.mock("./api", () => ({ adminApi: { logout: vi.fn() } }));
vi.mock("./BackupsExportCard", () => ({ BackupsExportCard: () => null }));
vi.mock("./takeoutRun", () => ({ downloadShop: vi.fn(async () => "1 product") }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const calls: Array<[string, any]> = [];
let billingNow: any = null;
vi.mock("./platformBilling", async (real) => {
  const actual = await real<typeof import("./platformBilling")>();
  return {
    ...actual,
    billingCall: vi.fn(async (_plan: any, step: string, body?: any) => {
      calls.push([step, body]);
      if (step === "status") return { billing: billingNow };
      if (step === "close") {
        if (billingNow.status === "trialing") { billingNow = { ...billingNow, access: "closed" }; return { closed: true, closesAt: null }; }
        billingNow = { ...billingNow, cancelAtPeriodEnd: true }; return { closed: false, closesAt: billingNow.currentPeriodEnd };
      }
      if (step === "keep") { billingNow = { ...billingNow, cancelAtPeriodEnd: false }; return {}; }
      if (step === "upcoming") return { bill: null };
      if (step === "payment-methods") return { cards: [] };
      if (step === "invoices" || step === "invoice-page") return { invoices: [] };
      if (step === "details") return { details: { name: "Test Press", email: "owner@example.com", country: "CA", address: null, taxNumber: "" } };
      return {};
    }),
  };
});

import { CloseShopSettings } from "./PlanParts";
import { CLOSING_STEPS, closeShopStage } from "./closeShop";
import { SETTINGS_SECTIONS, SETTINGS_ITEM_PREFIX } from "./riso/nav";
import { routeFromHash } from "./adminRoute";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = vi.fn();

const HUB = { state: "active", hub: "https://platform.example/api/shop-billing/", shopId: "test-shop", link: "https://platform.example/account/billing?shop=test-shop" };
const OPEN = { access: "open", status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-12-01T00:00:00Z", plan: "both", planName: "Colophon", price: "$5", plusTax: true, hasCard: true };

let root: ReturnType<typeof createRoot> | null = null;
async function show() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<CloseShopSettings />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).filter((b) => b.textContent === text);
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.innerHTML = ""; calls.length = 0; });

describe("Settings › Close shop", () => {
  it("shows both tiles and the timeline even when the shop has no plan, and offers to close it for them", async () => {
    planNow = { plan: null, failed: false };
    const c = await show();
    const card = c.querySelector("#close-shop")!;
    expect(card.textContent).toContain("Take everything with you");
    expect(card.textContent).toContain("Close your shop");
    expect(card.textContent).toContain("What happens next");
    expect(card.textContent).toContain("Deleted for good");
    expect(buttons(c, "Download your shop")).toHaveLength(1);
  });

  it("sends an older plan to the account page to close", async () => {
    planNow = { plan: { state: "active", link: HUB.link }, failed: false };
    const c = await show();
    const link = Array.from(c.querySelectorAll("#close-shop a")).find((a) => a.textContent === "Close on your account page") as HTMLAnchorElement;
    expect(link?.href).toBe(HUB.link);
  });

  it("on a paid month: Close shop, a plain yes, then Keep my shop open", async () => {
    planNow = { plan: HUB, failed: false };
    billingNow = { ...OPEN };
    const c = await show();
    expect(c.querySelector("[data-close-shop]")?.getAttribute("data-close-shop")).toBe("open");
    expect(c.textContent).toContain("It stays open until");
    await act(async () => buttons(c, "Close shop")[0].click());
    expect(document.querySelector(".rp-dialog select, .rp-dialog textarea")).toBeNull();
    await act(async () => buttons(document.body, "Yes, close my shop")[0].click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(calls.some(([step]) => step === "close")).toBe(true);
    expect(c.querySelector("[data-close-shop]")?.getAttribute("data-close-shop")).toBe("cancelled");
    await act(async () => buttons(c, "Keep my shop open")[0].click());
    expect(calls.some(([step]) => step === "keep")).toBe(true);
  });

  it("on a free trial: closes today, then offers Open my shop again", async () => {
    planNow = { plan: HUB, failed: false };
    billingNow = { ...OPEN, status: "trialing" };
    const c = await show();
    expect(c.textContent).toContain("It closes to shoppers as soon as you say yes.");
    await act(async () => buttons(c, "Close shop")[0].click());
    await act(async () => buttons(document.body, "Yes, close my shop")[0].click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(c.querySelector("[data-close-shop]")?.getAttribute("data-close-shop")).toBe("closed");
    expect(buttons(c, "Open my shop again")).toHaveLength(1);
  });
});

describe("the rules behind it", () => {
  it("names the stage of the plan", () => {
    expect(closeShopStage(null, { loaded: false, failed: false })).toBe("loading");
    expect(closeShopStage(null, { loaded: false, failed: true })).toBe("unknown");
    expect(closeShopStage(null, { loaded: true, failed: false })).toBe("none");
    expect(closeShopStage({ access: "open", cancelAtPeriodEnd: false }, { loaded: true, failed: false })).toBe("open");
    expect(closeShopStage({ access: "open", cancelAtPeriodEnd: true }, { loaded: true, failed: false })).toBe("cancelled");
    expect(closeShopStage({ access: "closed", cancelAtPeriodEnd: true }, { loaded: true, failed: false })).toBe("closed");
  });

  it("tells the closing timeline Julian chose", () => {
    const text = CLOSING_STEPS.map((s) => `${s.when} ${s.what}`).join(" ");
    for (const part of ["90 days", "30 and 7 days", "deleted for good", "60 days"]) expect(text).toContain(part);
  });

  it("puts Close shop in the Settings menu, and every older address opens it", () => {
    expect(SETTINGS_SECTIONS.find((g) => g.label === "Safety")?.pages).toContain(SETTINGS_ITEM_PREFIX + "close");
    for (const hash of ["#settings/close", "#settings/plan/close", "#settings/billing/close"]) {
      expect(routeFromHash(hash, false)).toMatchObject({ tab: "settings", settingsTab: "close" });
    }
  });

  it("points to it from the Plan page", () => {
    expect(readFileSync(join(__dirname, "BillingHub.tsx"), "utf8")).toContain("#settings/close");
  });
});
