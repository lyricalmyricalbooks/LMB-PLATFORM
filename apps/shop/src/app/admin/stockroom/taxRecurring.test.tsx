// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { RecurringSubscriptionsCard } from "./RecurringSubscriptions";
import { SortingRulesCard } from "./SortingRules";
import { stockroomWriteApi } from "./stockroomWrite";
import { blankSub, checkSub, postDueCharges, removeSub, saveSub, togglePause } from "./taxRecurring";
import { addRule, categoryFromRules, normalizeRuleText, removeRule, rulesOf } from "./taxRules";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 10, 11); // 11 Nov 2026
const tc = () => ({
  settings: { baseCurrency: "CAD", rates: { EUR_CAD: 1.5 } },
  businessExpenses: [{ id: 1, desc: "Old", amount: 5 }],
  recurring: [{ id: "r1", desc: "Hosting", cat: "Software & Subscriptions", amount: 20, currency: "CAD", frequency: "monthly", startDate: "2026-09-01", lastInjected: "2026-09" }],
});

describe("recurring subscriptions", () => {
  it("posts the charges that came due, once, at the amount in force, and marks the month", () => {
    const { taxCenter, posted } = postDueCharges(tc(), NOW);
    expect(posted).toBe(2); // October and November
    expect(taxCenter.businessExpenses.slice(0, 2).map((e: any) => e.date).sort()).toEqual(["2026-10-01", "2026-11-01"]);
    expect(taxCenter.businessExpenses[0]).toMatchObject({ desc: "Hosting (Recurring)", cat: "Software & Subscriptions", amount: 20, baseAmount: 20, ref: "Auto-Injected", recurringId: "r1" });
    expect(taxCenter.recurring[0].lastInjected).toBe("2026-11");
    expect(postDueCharges(taxCenter, NOW).posted).toBe(0); // running it twice adds nothing
  });
  it("flags a past foreign charge instead of booking it at today's rate, and skips paused ones", () => {
    const eur = tc(); eur.recurring[0].currency = "EUR";
    expect(postDueCharges(eur, NOW).taxCenter.businessExpenses[0]).toMatchObject({ baseAmount: null, fxMissing: true });
    const paused = tc(); (paused.recurring[0] as any).paused = true;
    expect(postDueCharges(paused, NOW).posted).toBe(0);
  });
  it("adds, edits (keeping its marker), pauses, resumes without back-billing, and removes", () => {
    const form = { ...blankSub("CAD", "2026-11-11"), desc: "Rent", amount: "400", cat: "Home Office" };
    expect(checkSub({ ...form, amount: "0" })).toMatchObject({ ok: false });
    const added = saveSub(tc(), form, null);
    expect(added.recurring).toHaveLength(2);
    expect(added.recurring[1]).toMatchObject({ desc: "Rent", amount: 400, paused: false, lastInjected: "" });
    expect(saveSub(tc(), { ...form, desc: "Hosting", amount: "25" }, "r1").recurring[0]).toMatchObject({ amount: 25, lastInjected: "2026-09", id: "r1" });
    const paused = togglePause(tc(), "r1", NOW);
    expect(paused.recurring[0].paused).toBe(true);
    expect(togglePause(paused, "r1", NOW).recurring[0]).toMatchObject({ paused: false, lastInjected: "2026-10" });
    expect(removeSub(tc(), "r1").recurring).toEqual([]);
    expect(removeSub(tc(), "r1").businessExpenses).toHaveLength(1); // posted charges stay
  });
});

describe("sorting rules", () => {
  const rules = { expenseRules: [{ id: "a", match: "post", cat: "Shipping & Postage" }, { id: "b", match: "Canada Post", cat: "Other" }, { id: "c", match: "x", cat: "Other" }] };
  it("matches whole words and the longest rule wins; junk rules are ignored", () => {
    expect(normalizeRuleText("Canva.com")).toBe("canva com");
    expect(rulesOf(rules)).toHaveLength(2);
    expect(categoryFromRules(rules, "Canada Post label", ["Other", "Shipping & Postage"])).toBe("Other");
    expect(categoryFromRules(rules, "PostNet", ["Other", "Shipping & Postage"])).toBeNull();
    expect(categoryFromRules(rules, "post office", ["Shipping & Postage"])).toBe("Shipping & Postage");
  });
  it("adds, re-points the same words, refuses too-short words, and removes", () => {
    const a = addRule(null, { match: "Canva", cat: "Software & Subscriptions" }, "r1", "t") as any;
    expect(a.taxCenter.expenseRules).toEqual([{ id: "r1", match: "Canva", cat: "Software & Subscriptions", createdAt: "t" }]);
    const b = addRule(a.taxCenter, { match: "canva ", cat: "Marketing & Advertising" }, "r2", "t2") as any;
    expect(b.taxCenter.expenseRules).toHaveLength(1);
    expect(b.taxCenter.expenseRules[0]).toMatchObject({ id: "r1", cat: "Marketing & Advertising", updatedAt: "t2" });
    expect(addRule(null, { match: "a", cat: "Other" }, "r", "t")).toEqual({ error: "Type a shop name or word with at least two letters." });
    expect(removeRule(b.taxCenter, "r1").expenseRules).toEqual([]);
  });
});

async function draw(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => {});
  return { container, root };
}
const button = (c: Element, text: string) => [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("the cards", () => {
  it("posts due charges when the subscriptions open, through the shared writer, and says so", async () => {
    const saved = vi.fn();
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockImplementation(async (_k, mutate) => ({ status: "saved", value: await mutate(tc()), merged: false, conflicts: [] }) as any);
    const { container, root } = await draw(<RecurringSubscriptionsCard taxCenter={tc()} onSaved={saved} now={NOW} />);
    expect(spy).toHaveBeenCalledWith("taxCenter", expect.any(Function));
    expect(saved.mock.calls[0][0].businessExpenses).toHaveLength(3);
    expect(container.textContent).toContain("2 due charges were added to the ledger.");
    expect(container.textContent).toContain("Hosting");
    await act(async () => root.unmount());
    spy.mockRestore();
  });
  it("shows an empty line, saves nothing, when there are no subscriptions", async () => {
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting");
    const { container, root } = await draw(<RecurringSubscriptionsCard taxCenter={null} onSaved={() => {}} now={NOW} />);
    expect(container.textContent).toContain("No subscriptions yet");
    expect(spy).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    spy.mockRestore();
  });
  it("lists a rule and shows a refused save", async () => {
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockResolvedValue({ status: "refused", reason: "no-permission", message: "Only the owner can change this." } as any);
    const { container, root } = await draw(<SortingRulesCard taxCenter={{ expenseRules: [{ id: "a", match: "Canva", cat: "Software & Subscriptions" }] }} onSaved={() => {}} />);
    expect(container.textContent).toContain("files under Software & Subscriptions");
    await act(async () => { button(container, "Remove")!.click(); });
    await act(async () => {});
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Only the owner");
    await act(async () => root.unmount());
    spy.mockRestore();
  });
});
