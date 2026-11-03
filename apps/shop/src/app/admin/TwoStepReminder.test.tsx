// @vitest-environment jsdom
// The admin home's two-step reminder (plan 22.10): only an owner, only on a paid plan, only without two-step, and
// "Not now" hides it on this browser for two weeks.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TwoStepAuth } from "./adminTwoStep";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("./api", () => ({ adminApi: { myRole: async () => "owner" } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { TwoStepReminder, REMINDER_KEY, planIsPaid } = await import("./TwoStepReminder");

const USER = { email: "owner@example.com" } as any;
const twoWith = (factors: any[]) => ({ factors: () => factors } as unknown as TwoStepAuth);
const plan = (state: string) => ({ state } as any);

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; localStorage.clear(); });
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async (props: Record<string, unknown>) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(TwoStepReminder, { plan: plan("active"), two: twoWith([]), user: USER, role: async () => "owner", ...props } as any)));
  await flush();
};
const shown = () => !!document.querySelector("[data-two-step-reminder]");

describe("two-step reminder on the admin home", () => {
  it("counts active and payment-problem plans as paid, not a trial", () => {
    expect(planIsPaid(plan("active"))).toBe(true);
    expect(planIsPaid(plan("payment-problem"))).toBe(true);
    expect(planIsPaid(plan("trial"))).toBe(false);
    expect(planIsPaid(null)).toBe(false);
  });

  it("asks a paid plan's owner without two-step, with a link to Security", async () => {
    await mount({});
    expect(shown()).toBe(true);
    expect(document.body.textContent).toContain("Turn on two-step sign-in.");
    const setUp = [...document.querySelectorAll("button")].find((b) => b.textContent === "Set it up")!;
    await act(async () => { setUp.click(); });
    expect(window.location.hash).toBe("#settings/security");
  });

  it("stays quiet for staff, on a trial, and once two-step is on", async () => {
    await mount({ role: async () => "staff" });
    expect(shown()).toBe(false);
    act(() => root?.unmount());
    await mount({ plan: plan("trial") });
    expect(shown()).toBe(false);
    act(() => root?.unmount());
    await mount({ two: twoWith([{ uid: "f1", factorId: "totp", enrollmentTime: "x" }]) });
    expect(shown()).toBe(false);
  });

  it("hides for two weeks after Not now", async () => {
    const now = () => Date.parse("2026-11-03T12:00:00Z");
    await mount({ now });
    const notNow = [...document.querySelectorAll("button")].find((b) => b.textContent === "Not now")!;
    await act(async () => { notNow.click(); });
    expect(shown()).toBe(false);
    expect(Number(localStorage.getItem(REMINDER_KEY))).toBe(now() + 14 * 24 * 60 * 60 * 1000);
    act(() => root?.unmount());
    await mount({ now: () => now() + 13 * 24 * 60 * 60 * 1000 });
    expect(shown()).toBe(false);
    act(() => root?.unmount());
    await mount({ now: () => now() + 15 * 24 * 60 * 60 * 1000 });
    expect(shown()).toBe(true);
  });
});
