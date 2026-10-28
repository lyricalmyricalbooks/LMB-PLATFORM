// @vitest-environment jsdom
// Settings › Bookkeeping against a fake bookkeeping service (plan 7.16): the three steps, error words, disconnect.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ bookkeeping: vi.fn() }));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { BookkeepingSettings } = await import("./BookkeepingSettings");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const text = () => document.body.textContent || "";
const select = (label: string) => {
  const found = [...document.querySelectorAll("label")].find((l) => l.textContent?.trim() === label);
  return document.getElementById(found!.htmlFor) as HTMLSelectElement;
};
const choose = async (label: string, value: string) => {
  const el = select(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const RATES = [{ country: "CA", region: "AB", rate: "5", bookName: "GST" }];
const OPTIONS = {
  taxCodes: [{ id: "2", name: "Exempt", description: null }, { id: "5", name: "GST", description: null }],
  accounts: {
    income: [{ id: "40", name: "Sales", type: "Income", subType: null }],
    clearing: [{ id: "4", name: "Undeposited Funds", type: "Other Current Asset", subType: "UndepositedFunds" }],
    bank: [{ id: "35", name: "Chequing", type: "Bank", subType: null }],
    fees: [{ id: "8", name: "Bank charges", type: "Expense", subType: "BankCharges" }],
    giftCards: [{ id: "90", name: "Gift card liability", type: "Other Current Liability", subType: null }],
  },
  suggested: { income: "40", clearing: "4", bank: "35", fees: "8", giftCards: "90" },
};

/** A pretend bookkeeping service: answers each step from `world`. */
function fakeService(world: { status: any; fail?: Record<string, { code: string; message?: string }> }) {
  api.bookkeeping.mockImplementation(async (step: string, args: any = {}) => {
    const fail = world.fail?.[step];
    if (fail) throw Object.assign(new Error(fail.message ?? ""), { code: fail.code });
    if (step === "status") return world.status;
    if (step === "connect") return { url: `https://appcenter.example/connect?state=abc&back=${encodeURIComponent(args.returnUrl)}` };
    if (step === "options") return OPTIONS;
    if (step === "save") return (world.status = { ...world.status, ready: true, style: args.style, taxCodes: args.taxCodes, noTaxCode: args.noTaxCode });
    if (step === "disconnect") return (world.status = { ...world.status, connected: false, problem: "disconnected" });
    if (step === "resend") return { results: [{ kind: "day", ref: args.date, outcome: "already" }] };
    throw new Error(`unexpected ${step}`);
  });
}

const mount = async (openSignIn = vi.fn()) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(BookkeepingSettings, { taxRates: RATES, openSignIn })));
  await flush();
  return openSignIn;
};

describe("Settings › Bookkeeping", () => {
  it("shows nothing while the platform's bookkeeping link is off", async () => {
    fakeService({ status: { enabled: false } });
    await mount();
    expect(document.body.innerHTML).toBe("<div></div>");
  });

  it("step 1 opens Intuit's sign-in with a plain-text button, coming back to this page", async () => {
    fakeService({ status: { enabled: true, connected: false, mode: "test" } });
    const openSignIn = await mount();
    const connect = button("Connect to QuickBooks")!;
    expect(connect).toBeTruthy();
    expect(connect.querySelector("img, svg")).toBeNull();
    expect(text()).toContain("Step 1 of 3");
    await act(async () => { connect.click(); });
    await flush();
    expect(api.bookkeeping).toHaveBeenCalledWith("connect", { returnUrl: expect.stringMatching(/#settings\/bookkeeping$/) });
    expect(openSignIn).toHaveBeenCalledWith(expect.stringContaining("https://appcenter.example/connect"));
  });

  it("steps 2 and 3: choose every order, match taxes with suggested accounts, save", async () => {
    const world = { status: { enabled: true, connected: true, ready: false, companyName: "Moth Press Ltd" } as any };
    fakeService(world);
    await mount();
    expect(text()).toContain("Connected to Moth Press Ltd");
    const orders = [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")][1];
    await act(async () => { orders.click(); });
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(text()).toContain("Match taxes");
    // GST matched by name, accounts suggested, the no-tax code guessed from "Exempt".
    expect(select("GST is").value).toBe("5");
    expect(select("Payouts land in").value).toBe("35");
    expect(select("Sales with no tax").value).toBe("2");
    await choose("Card fees go to", "");
    expect(text()).toContain('Choose an account for "Card fees go to".');
    expect(button("Save and start sending")!.disabled).toBe(true);
    await choose("Card fees go to", "8");
    await act(async () => { button("Save and start sending")!.click(); });
    await flush();
    expect(api.bookkeeping).toHaveBeenCalledWith("save", { style: "orders", taxCodes: { GST: "5" }, noTaxCode: "2", accounts: { income: "40", clearing: "4", bank: "35", fees: "8", giftCards: "90" } });
    expect(text()).toContain("Every order");
    expect(text()).toContain("Nothing sent yet");
  });

  it("when set up: last day sent, Send again and the 30-day warning", async () => {
    fakeService({ status: { enabled: true, connected: true, ready: true, style: "daily", companyName: "Moth Press Ltd", lastSent: { date: "2026-10-27", at: "2026-10-28T07:00:00Z" }, endsSoon: true, endsAt: "2026-11-20T00:00:00Z" } });
    await mount();
    expect(text()).toContain("Sales sent up to October 27, 2026.");
    expect(text()).toContain("This connection ends on November 20, 2026");
    await act(async () => { button("Send again")!.click(); });
    await flush();
    expect(api.bookkeeping).toHaveBeenCalledWith("resend", { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(text()).toContain("already in QuickBooks. Nothing was sent twice.");
  });

  it("error words are plain, and a lost connection says to connect again", async () => {
    fakeService({ status: { enabled: true, connected: false, problem: "lost" }, fail: { connect: { code: "unreachable", message: "Failed to fetch" } } });
    await mount();
    expect(text()).toContain("QuickBooks stopped taking this shop's sales");
    await act(async () => { button("Connect to QuickBooks")!.click(); });
    await flush();
    const alerts = [...document.querySelectorAll("[role=alert]")].map((a) => a.textContent);
    expect(alerts).toContain("Couldn't open QuickBooks's sign-in. The platform didn't answer. Try again in a minute.");
  });

  it("Disconnect asks first, then goes back to step 1", async () => {
    fakeService({ status: { enabled: true, connected: true, ready: true, style: "daily" } });
    await mount();
    await act(async () => { button("Disconnect")!.click(); });
    await flush();
    expect(text()).toContain("Disconnect QuickBooks?");
    const confirm = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Disconnect").pop()!;
    await act(async () => { confirm.click(); });
    await flush();
    expect(api.bookkeeping).toHaveBeenCalledWith("disconnect");
    expect(button("Connect to QuickBooks")).toBeTruthy();
  });
});
