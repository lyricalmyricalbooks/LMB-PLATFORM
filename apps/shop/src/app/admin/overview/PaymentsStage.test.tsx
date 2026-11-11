// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  platformPayments: vi.fn(async (_step: string) => ({} as any)),
}));
vi.mock("../api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { PaymentsStage } = await import("./PaymentsStage");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const fee = { percent: 0, refundedWithRefunds: false };

async function mount(provider: "stripe" | "square", status: any, onDone = vi.fn(async () => {})) {
  api.platformPayments.mockResolvedValueOnce(status);
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(PaymentsStage, { provider, onDone })));
  await flush();
  return onDone;
}

describe("Get started, step 5: Get paid (plan 17.10)", () => {
  it("a Stripe press that hasn't connected sees one Continue with Stripe button and can set it up later", async () => {
    const onDone = await mount("stripe", { provider: "stripe", detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, platformFee: fee });
    expect(text()).toContain("Get paid");
    expect(text()).toContain("Stripe isn't connected yet");
    expect(button("Continue with Stripe")).toBeTruthy();
    await act(async () => { button("Set up later")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });

  it("names what Stripe needs, with its date, and never shows an account ID", async () => {
    await mount("stripe", {
      provider: "stripe", detailsSubmitted: true, chargesEnabled: false, payoutsEnabled: false, platformFee: fee,
      accountId: "acct_secret123", needs: [{ words: "your bank details", pastDue: false }], deadline: "2026-11-12T12:00:00.000Z",
    });
    expect(text()).toContain("Stripe needs your bank details by 12 November");
    expect(text()).not.toContain("acct_secret123");
  });

  it("a past-due requirement is an alert that says Stripe has paused payments", async () => {
    await mount("stripe", {
      provider: "stripe", detailsSubmitted: true, chargesEnabled: false, payoutsEnabled: false, platformFee: fee,
      needs: [{ words: "your date of birth", pastDue: true }], pastDue: true, deadline: "2026-10-30T12:00:00.000Z",
    });
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Stripe needs your date of birth now");
    expect(text()).toContain("Stripe has paused card payments or payouts");
  });

  it("a Stripe press whose cards and payouts work sees Continue, which records ready", async () => {
    const onDone = await mount("stripe", {
      provider: "stripe", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, needs: [], platformFee: fee,
    });
    expect(text()).toContain("Cards and payouts are working");
    expect(button("Continue with Stripe")).toBeUndefined();
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), ready: true });
  });

  it("a Square press connects with Connect Square, and is ready once it takes cards", async () => {
    await mount("square", { provider: "square", connected: false, platformFee: fee });
    expect(button("Connect Square")).toBeTruthy();
    expect(text()).not.toContain("Stripe");
  });

  it("a Square press that takes cards sees Continue", async () => {
    const onDone = await mount("square", { provider: "square", connected: true, chargesEnabled: true, platformFee: fee });
    expect(text()).toContain("Square is connected and taking cards.");
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), ready: true });
  });

  it("if the account can't be checked, the press can try again or set it up later", async () => {
    api.platformPayments.mockRejectedValueOnce(new Error("offline"));
    const onDone = vi.fn(async () => {});
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(PaymentsStage, { provider: "stripe", onDone })));
    await flush();
    expect(text()).toContain("Your Stripe account couldn't be checked");
    await act(async () => { button("Set up later")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });
});
