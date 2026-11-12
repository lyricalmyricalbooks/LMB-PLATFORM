// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { LogExpenseCard } from "./LogExpense";
import { stockroomWriteApi } from "./stockroomWrite";
import { addBusinessExpense, blankExpense, checkExpense, isDuplicate, tripChoices } from "./taxExpense";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tc = { settings: { baseCurrency: "CAD", rates: { EUR_CAD: 1.5 } }, businessExpenses: [{ id: 1, date: "2026-06-11", desc: "Booth fee", amount: 250, trip: "Toronto Book Fair" }], trips: [{ name: "Vienna" }] };
const form = { ...blankExpense("CAD", "2026-11-11"), desc: "Squarespace", amount: "20" };

describe("logging a business expense", () => {
  it("asks for what is missing", () => {
    const r = checkExpense({ ...form, desc: " ", amount: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["amount", "desc"]);
    expect(checkExpense(form)).toEqual({ ok: true, amount: 20 });
  });
  it("adds the old stockroom's row first, converting at the saved rate", () => {
    const next = addBusinessExpense(tc, { ...form, currency: "EUR", trip: "Vienna" }, 20, 99);
    expect(next.businessExpenses[0]).toMatchObject({ id: 99, desc: "Squarespace", amount: 20, currency: "EUR", origAmount: 20, fxRate: 1.5, baseAmount: 30, trip: "Vienna" });
    expect(next.businessExpenses).toHaveLength(2);
    expect(tc.businessExpenses).toHaveLength(1); // the copy it was given is untouched
  });
  it("leaves the base amount empty and flagged when no rate is saved, and never adds the same id twice", () => {
    const next = addBusinessExpense(tc, { ...form, currency: "USD" }, 20, 5);
    expect(next.businessExpenses[0]).toMatchObject({ baseAmount: null, fxMissing: true });
    expect(addBusinessExpense(next, form, 20, 5).businessExpenses).toHaveLength(2);
  });
  it("spots a duplicate and lists trips", () => {
    expect(isDuplicate(tc, { ...form, desc: "booth FEE", date: "2026-06-11" }, 250)).toBe(true);
    expect(isDuplicate(tc, form, 20)).toBe(false);
    expect(tripChoices(tc)).toEqual([{ name: "Toronto Book Fair", count: 1 }, { name: "Vienna", count: 0 }]);
  });
});

async function draw(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, root };
}
const type = async (el: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
};

describe("the form", () => {
  it("saves through the shared writer and shows the saved Tax centre", async () => {
    const saved = vi.fn();
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockImplementation(async (_k, mutate) => {
      const value = await mutate(tc);
      return { status: "saved", value, merged: false, conflicts: [] } as any;
    });
    const { container, root } = await draw(<LogExpenseCard taxCenter={tc} onSaved={saved} />);
    await type(container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]')!, "Squarespace");
    await type(container.querySelector('input[type="number"]')!, "20");
    await act(async () => { (container.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    await act(async () => {});
    expect(spy).toHaveBeenCalledWith("taxCenter", expect.any(Function));
    expect(saved.mock.calls[0][0].businessExpenses[0]).toMatchObject({ desc: "Squarespace", amount: 20 });
    expect(container.textContent).toContain("Logged: Squarespace.");
    await act(async () => root.unmount());
    spy.mockRestore();
  });
  it("files the category from a sorting rule until one is picked by hand", async () => {
    const withRule = { ...tc, expenseRules: [{ id: "a", match: "Canva", cat: "Marketing & Advertising" }] };
    const { container, root } = await draw(<LogExpenseCard taxCenter={withRule} onSaved={() => {}} />);
    const select = () => container.querySelector("select") as HTMLSelectElement;
    await type(container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]')!, "Canva Pro");
    expect(select().value).toBe("Marketing & Advertising");
    expect(container.textContent).toContain("Filed here by one of your sorting rules.");
    await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!; set.call(select(), "Travel"); select().dispatchEvent(new Event("change", { bubbles: true })); });
    await type(container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]')!, "Canva Pro yearly");
    expect(select().value).toBe("Travel");
    await act(async () => root.unmount());
  });
  it("says so when the save is refused and keeps what was typed", async () => {
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockResolvedValue({ status: "refused", reason: "no-permission", message: "Only the owner can change this." } as any);
    const saved = vi.fn();
    const { container, root } = await draw(<LogExpenseCard taxCenter={tc} onSaved={saved} />);
    await type(container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]')!, "Squarespace");
    await type(container.querySelector('input[type="number"]')!, "20");
    await act(async () => { (container.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    await act(async () => {});
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Only the owner");
    expect(saved).not.toHaveBeenCalled();
    expect((container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]') as HTMLInputElement).value).toBe("Squarespace");
    await act(async () => root.unmount());
    spy.mockRestore();
  });
  it("v4 New expense page: the status bar counts what is missing, then adds it", async () => {
    const saved = vi.fn();
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockImplementation(async (_k, mutate) => {
      const value = await mutate(tc);
      return { status: "saved", value, merged: false, conflicts: [] } as any;
    });
    const { container, root } = await draw(<LogExpenseCard page taxCenter={tc} onSaved={saved} />);
    expect(container.textContent).toContain("2 required fields to fill in");
    const add = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Add expense") as HTMLButtonElement;
    await act(async () => { add().click(); });
    expect(container.textContent).toContain("Fill in the highlighted fields.");
    expect(spy).not.toHaveBeenCalled();
    await type(container.querySelector('input[placeholder="e.g. Squarespace or Shopify"]')!, "Squarespace");
    await type(container.querySelector('input[type="number"]')!, "20");
    expect(container.textContent).toContain("Ready to add");
    await act(async () => { add().click(); });
    await act(async () => {});
    expect(saved.mock.calls[0][0].businessExpenses[0]).toMatchObject({ desc: "Squarespace", amount: 20 });
    await act(async () => root.unmount());
    spy.mockRestore();
  });
});
