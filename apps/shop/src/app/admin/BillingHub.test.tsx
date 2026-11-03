// @vitest-environment jsdom
// Settings › Plan and Settings › Billing (code plan 22.3) against a pretend platform: the plan with the founding price,
// changing plan through its preview, cancelling with a reason, saved cards, Pay now after a decline, billing details,
// bills, and a paid plan's change sent to the account page to finish with two-step sign-in.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: { getIdToken: async () => "pass" } } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { PlanPage, BillingPage } = await import("./BillingHub");

const PLAN = {
  plan: "both", state: "trial", access: "open", trialEnd: "2026-11-17T12:00:00Z", nextPaymentAt: null, hasCard: true, cancelAtPeriodEnd: false, endsAt: null,
  paymentWay: "monthly", link: "https://platform.example/account/billing?shop=moth-press", hub: "https://platform.example/api/shop-billing/", shopId: "moth-press", founding: true, closing: null,
} as const;

function status(over: Record<string, unknown> = {}) {
  return {
    plan: "both", planName: "Shop and stockroom", price: "$39.00", plusTax: true, status: "trialing", access: "open", trialEnd: "2026-11-17T12:00:00Z", trialDaysLeft: 14,
    currentPeriodEnd: null, nextPaymentAt: "2026-11-17T12:00:00Z", cancelAtPeriodEnd: false, hasCard: true, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, words: "Visa ending 4242" },
    appsClosing: null, plans: [{ plan: "shop", name: "Shop", price: "$29.00", apps: ["shop"] }, { plan: "stockroom", name: "Stockroom", price: "$19.00", apps: ["stockroom"] }, { plan: "both", name: "Shop and stockroom", price: "$39.00", apps: ["shop", "stockroom"] }],
    paymentWay: "monthly", founding: { percentOff: 25, price: "$29.25" }, paymentProblem: null, canPayNow: false, ...over,
  };
}

type World = { status: any; calls: Array<[string, any]>; refuse?: Record<string, any>; cards: any[] };
let world: World;
function platform() {
  return vi.fn(async (url: string, init: RequestInit) => {
    const call = url.replace("https://platform.example/api/shop-billing/", "");
    const body = JSON.parse(String(init.body));
    world.calls.push([call, body]);
    const send = (code: number, b: unknown) => ({ ok: code < 300, status: code, json: async () => b }) as Response;
    if (world.refuse?.[call]) return send(403, { ok: false, ...world.refuse[call] });
    switch (call) {
      case "status": return send(200, { ok: true, billing: world.status, accountPage: PLAN.link, changesNeedTwoStep: !!world.refuse });
      case "payment-way": return send(200, { ok: true, view: { way: "monthly", title: "How you pay", lines: ["$39 a month."], button: { label: "Switch to pay as you sell", to: "payAsYouSell" }, note: "" } });
      case "change-plan":
        if (body.preview) return send(200, { ok: true, preview: { plan: body.plan, planName: "Shop", price: "$29.00", from: "both", adds: [], closes: ["stockroom"], immediate: true, closesAt: "2026-11-03T12:00:00Z", downloadUntil: "2027-02-01T12:00:00Z", prorate: false, prorated: null } });
        world.status = { ...world.status, plan: body.plan, planName: "Shop", price: "$29.00" };
        return send(200, { ok: true, plan: body.plan, changed: true });
      case "cancel": world.status = { ...world.status, cancelAtPeriodEnd: true }; return send(200, { ok: true, cancelAtPeriodEnd: true });
      case "keep": world.status = { ...world.status, cancelAtPeriodEnd: false }; return send(200, { ok: true, cancelAtPeriodEnd: false });
      case "payment-methods": return send(200, { ok: true, cards: world.cards });
      case "payment-methods/primary": world.cards = world.cards.map((c) => ({ ...c, primary: c.id === body.cardId })); return send(200, { ok: true, changed: true });
      case "upcoming": return send(200, { ok: true, bill: { date: "2026-11-17T12:00:00Z", lines: [{ words: "Shop and stockroom", amount: "$39.00" }], subtotal: "$39.00", discount: "$9.75", tax: "$3.80", total: "$33.05" } });
      case "invoices": return send(200, { ok: true, invoices: [{ id: "in_1", number: "COL-0001", date: "2026-10-17T12:00:00Z", amount: "$33.05", tax: "$3.80", status: "paid", pdfUrl: "https://pay.stripe.example/in_1.pdf", pageUrl: null }] });
      case "details": return send(200, { ok: true, details: { name: "Moth Press", email: "owner@example.com", address: null, taxNumber: "", taxLabel: "", plusTax: true } });
      case "details/save": return send(200, { ok: true, saved: true });
      case "pay-now": world.status = { ...world.status, status: "active", paymentProblem: null, canPayNow: false }; return send(200, { ok: true, paid: true });
      default: return send(404, { ok: false, message: "There's nothing here." });
    }
  });
}

let root: Root | null = null;
beforeEach(() => {
  world = { status: status(), calls: [], cards: [{ id: "pm_1", words: "Visa ending 4242", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, primary: true, expired: false }, { id: "pm_2", words: "Mastercard ending 4444", brand: "mastercard", last4: "4444", expMonth: 1, expYear: 2031, primary: false, expired: false }] };
  vi.stubGlobal("fetch", platform());
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };
const mount = async (Page: typeof PlanPage) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(Page, { plan: PLAN as any })));
  await flush();
};
const type = async (label: string, value: string) => {
  const found = [...document.querySelectorAll("label")].find((l) => l.textContent?.trim() === label)!;
  const input = document.getElementById(found.htmlFor) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("Settings › Plan", () => {
  it("shows the plan with its founding price, the trial and the card", async () => {
    await mount(PlanPage);
    expect(text()).toContain("Shop and stockroom");
    expect(text()).toContain("$29.25 a month plus tax");
    expect(text()).toContain("Founding: 25% off for good");
    expect(text()).toContain("14 days left");
    expect(text()).toContain("Visa ending 4242");
    expect(text()).toContain("Switch to pay as you sell");
  });

  it("changes plan through its preview: what closes and when, then the switch", async () => {
    await mount(PlanPage);
    const shop = document.querySelector('[data-plan-option="shop"] input') as HTMLInputElement;
    await click(shop);
    expect(text()).toContain("Switch to Shop?");
    expect(text()).toContain("The stockroom closes now.");
    await click(button("Switch plan"));
    expect(world.calls.filter(([c]) => c === "change-plan").map(([, b]) => [b.plan, b.preview ?? false])).toEqual([["shop", true], ["shop", false]]);
    expect(text()).not.toContain("Switch to Shop?");
  });

  it("cancels with the press's reason, then keeps the plan", async () => {
    await mount(PlanPage);
    await click(button("Cancel plan"));
    const select = [...document.querySelectorAll("select")][0] as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "price");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const confirm = [...document.querySelectorAll(".rp-dialog button")].find((b) => b.textContent?.trim() === "Cancel plan")!;
    await click(confirm);
    expect(world.calls.find(([c]) => c === "cancel")![1].reason).toBe("price");
    expect(text()).toContain("Keep my plan");
    await click(button("Keep my plan"));
    expect(world.calls.some(([c]) => c === "keep")).toBe(true);
  });

  it("a paid plan's change is sent to the account page to finish with two-step sign-in", async () => {
    world.refuse = { "change-plan": { message: "Your plan is paid, so this change needs your two-step sign-in. Finish it on your account page.", twoStep: true, accountPage: PLAN.link } };
    await mount(PlanPage);
    expect(document.querySelector("[data-two-step-note]")).not.toBeNull();
    await click(document.querySelector('[data-plan-option="shop"] input')!);
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent?.includes("Finish on your account page")) as HTMLAnchorElement;
    expect(link.href).toBe(PLAN.link);
  });
});

describe("Settings › Billing", () => {
  it("shows the next bill with the founding discount and tax, saved cards and past bills", async () => {
    await mount(BillingPage);
    expect(text()).toContain("−$9.75");
    expect(text()).toContain("$33.05");
    expect(text()).toContain("Mastercard ending 4444");
    expect(text()).toContain("Primary");
    const pdf = [...document.querySelectorAll("a")].find((a) => a.textContent === "Download") as HTMLAnchorElement;
    expect(pdf.href).toBe("https://pay.stripe.example/in_1.pdf");
  });

  it("makes another card primary", async () => {
    await mount(BillingPage);
    await click(button("Make primary"));
    expect(world.calls.find(([c]) => c === "payment-methods/primary")![1].cardId).toBe("pm_2");
  });

  it("after a decline: the problem, then Pay now clears it", async () => {
    world.status = status({ status: "past_due", paymentProblem: { kind: "declined", at: "2026-11-03T00:00:00Z", amount: "$33.05", nextTry: "2026-11-06T00:00:00Z", pageUrl: null }, canPayNow: true });
    await mount(BillingPage);
    expect(text()).toContain("We couldn't take your $33.05 payment.");
    await click(button("Pay now"));
    expect(world.calls.some(([c]) => c === "pay-now")).toBe(true);
    expect(text()).not.toContain("We couldn't take your");
  });

  it("the bank asking to confirm links to the payment page instead of Pay now", async () => {
    world.status = status({ status: "past_due", paymentProblem: { kind: "confirm", at: "x", amount: "$33.05", nextTry: null, pageUrl: "https://invoice.stripe.example/in_2" }, canPayNow: true });
    await mount(BillingPage);
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent === "Confirm the payment") as HTMLAnchorElement;
    expect(link.href).toBe("https://invoice.stripe.example/in_2");
    expect(button("Pay now")).toBeUndefined();
  });

  it("saves billing details with the tax number", async () => {
    await mount(BillingPage);
    await type("GST/HST or QST number (optional)", "123456789 RT 0001");
    await click(button("Save billing details"));
    const saved = world.calls.find(([c]) => c === "details/save")![1];
    expect(saved).toMatchObject({ name: "Moth Press", email: "owner@example.com", taxNumber: "123456789 RT 0001", address: null });
    expect(text()).toContain("Saved.");
  });
});
