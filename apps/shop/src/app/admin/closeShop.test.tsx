// @vitest-environment jsdom
// The way out of Colophon (Julian, 12 November 2026: "I see no path for people to exit their subscription and close the
// shop and download their data"). Settings › Billing must always end with Close your shop: download, cancel, what
// happens next, whatever state the plan is in. These tests fail if that path drops off the page again.
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
      if (step === "cancel") { billingNow = { ...billingNow, cancelAtPeriodEnd: true }; return {}; }
      if (step === "keep") { billingNow = { ...billingNow, cancelAtPeriodEnd: false }; return {}; }
      if (step === "upcoming") return { bill: null };
      if (step === "payment-methods") return { cards: [] };
      if (step === "invoices" || step === "invoice-page") return { invoices: [] };
      if (step === "details") return { details: { name: "Test Press", email: "owner@example.com", country: "CA", address: null, taxNumber: "" } };
      return {};
    }),
  };
});

import { BillingSettings } from "./PlanParts";
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
  await act(async () => root!.render(<BillingSettings />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}
const buttons = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).filter((b) => b.textContent === text);
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.innerHTML = ""; calls.length = 0; });

describe("Settings › Billing › Close your shop", () => {
  it("is on the page with all three steps even when the shop has no plan", async () => {
    planNow = { plan: null, failed: false };
    const c = await show();
    const card = c.querySelector("#close-shop")!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Close your shop");
    expect(card.textContent).toContain("Download your shop");
    expect(card.textContent).toContain("Cancel your plan");
    expect(card.textContent).toContain("What happens next");
    expect(buttons(c, "Download your shop")).toHaveLength(1);
  });

  it("is still there when billing can't be read", async () => {
    planNow = { plan: null, failed: true };
    const c = await show();
    expect(c.textContent).toContain("Billing not loaded");
    expect(c.querySelector("#close-shop")).toBeTruthy();
  });

  it("sends an older plan to the account page to cancel", async () => {
    planNow = { plan: { state: "active", link: HUB.link }, failed: false };
    const c = await show();
    const link = Array.from(c.querySelectorAll("#close-shop a")).find((a) => a.textContent === "Cancel on your account page") as HTMLAnchorElement;
    expect(link?.href).toBe(HUB.link);
  });

  it("cancels the plan from the card, then offers Keep my plan", async () => {
    planNow = { plan: HUB, failed: false };
    billingNow = { ...OPEN };
    const c = await show();
    expect(c.querySelector("[data-close-shop]")?.getAttribute("data-close-shop")).toBe("open");
    await act(async () => buttons(c, "Cancel plan")[0].click());
    const confirm = buttons(document.body, "Cancel plan").at(-1)!;
    await act(async () => confirm.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(calls.some(([step]) => step === "cancel")).toBe(true);
    expect(c.querySelector("#close-shop")?.textContent).toContain("Cancelled. Your shop stays open until");
    expect(buttons(c, "Keep my plan").length).toBeGreaterThan(0);
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

  it("keeps Billing in the Settings menu and #settings/billing/close opening the card", () => {
    expect(SETTINGS_SECTIONS.find((g) => g.label === "Shop")?.pages).toContain(SETTINGS_ITEM_PREFIX + "billing");
    expect(routeFromHash("#settings/billing/close", false)).toMatchObject({ tab: "settings", settingsTab: "billing", subTab: "close-shop" });
  });

  it("points to it from the Plan page", () => {
    expect(readFileSync(join(__dirname, "BillingHub.tsx"), "utf8")).toContain("#settings/billing/close");
  });
});
