// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { PendingExpensesCard } from "./PendingExpenses";
import { stockroomWriteApi } from "./stockroomWrite";
import { addBusinessExpense } from "./taxExpense";
import { blankPending, checkPending, confirmPrefill, deletePending, pendingDue, savePending, snoozePending, sortedPending } from "./taxPending";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-11-11";
const tc = {
  settings: { baseCurrency: "CAD" },
  businessExpenses: [],
  pendingExpenses: [
    { id: 1, desc: "Later thing", remindOn: "2026-12-30", cat: "Travel", currency: "CAD", estAmount: 0 },
    { id: 2, desc: "Flights", remindOn: "2026-11-09", cat: "Travel", currency: "EUR", estAmount: 300, trip: "Vienna", expectedDate: "2026-11-20" },
    { id: 3, desc: "No reminder" },
  ],
};

describe("pending notes", () => {
  it("says how due each one is and lists the most urgent first", () => {
    expect(pendingDue(tc.pendingExpenses[1], TODAY)).toMatchObject({ state: "overdue", days: -2, label: "2 days overdue" });
    expect(pendingDue({ remindOn: TODAY }, TODAY).label).toBe("Due today");
    expect(sortedPending(tc, TODAY).map((r) => r.item.id)).toEqual([2, 1, 3]);
  });
  it("needs a description and a numeric estimate", () => {
    expect(checkPending({ ...blankPending("CAD"), desc: "", estAmount: "x" })).toMatchObject({ ok: false });
    expect(checkPending({ ...blankPending("CAD"), desc: "Booth" })).toEqual({ ok: true });
  });
  it("adds, edits, snoozes and deletes without touching the rest of the Tax centre", () => {
    const added = savePending(tc, { ...blankPending("CAD"), desc: " Booth ", estAmount: "100" }, 9, TODAY);
    expect(added.pendingExpenses[0]).toMatchObject({ id: 9, desc: "Booth", estAmount: 100, created: TODAY });
    expect(added.settings).toBe(tc.settings);
    const edited = savePending(added, { ...blankPending("CAD"), desc: "Booth stand" }, 9, "2026-12-01");
    expect(edited.pendingExpenses).toHaveLength(4);
    expect(edited.pendingExpenses[0]).toMatchObject({ desc: "Booth stand", created: TODAY });
    expect(snoozePending(tc, 2, 7, TODAY).pendingExpenses.find((p: any) => p.id === 2).remindOn).toBe("2026-11-18");
    expect(deletePending(tc, 2).pendingExpenses.map((p: any) => p.id)).toEqual([1, 3]);
    expect(tc.pendingExpenses).toHaveLength(3);
  });
  it("confirming logs the expense and clears the note in one save", () => {
    const form = confirmPrefill(tc.pendingExpenses[1], TODAY);
    expect(form).toMatchObject({ desc: "Flights", cat: "Travel", date: "2026-11-20", amount: "300", currency: "EUR", trip: "Vienna" });
    const next = addBusinessExpense(tc, form, 300, 77, new Date(), 2);
    expect(next.businessExpenses[0]).toMatchObject({ id: 77, desc: "Flights" });
    expect(next.pendingExpenses.map((p: any) => p.id)).toEqual([1, 3]);
  });
});

async function draw(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, root };
}
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await act(async () => {}); };
const button = (c: Element, text: string) => [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("the pending card", () => {
  it("shows each note with its due state and hands a confirmed one to the log form", async () => {
    const confirm = vi.fn();
    const { container, root } = await draw(<PendingExpensesCard taxCenter={tc} onSaved={() => {}} onConfirm={confirm} today={TODAY} />);
    expect(container.textContent).toContain("2 days overdue");
    expect(container.textContent).toContain("Amount unknown");
    await click(button(container, "Confirm & log"));
    expect(confirm).toHaveBeenCalledWith({ noteId: 2, form: expect.objectContaining({ desc: "Flights", amount: "300" }) });
    await act(async () => root.unmount());
  });
  it("snoozes through the shared writer and shows the saved Tax centre", async () => {
    const saved = vi.fn();
    const spy = vi.spyOn(stockroomWriteApi, "updateSetting").mockImplementation(async (_k, mutate) => ({ status: "saved", value: await mutate(tc), merged: false, conflicts: [] }) as any);
    const { container, root } = await draw(<PendingExpensesCard taxCenter={tc} onSaved={saved} onConfirm={() => {}} today={TODAY} />);
    await click(button(container, "+1 week"));
    expect(spy).toHaveBeenCalledWith("taxCenter", expect.any(Function));
    expect(saved).toHaveBeenCalled();
    expect(container.textContent).toContain("Reminder moved a week on.");
    await act(async () => root.unmount());
    spy.mockRestore();
  });
  it("shows the card with an empty line when there are no notes", async () => {
    const { container, root } = await draw(<PendingExpensesCard taxCenter={null} onSaved={() => {}} onConfirm={() => {}} />);
    expect(container.textContent).toContain("Pending & to confirm");
    expect(container.textContent).toContain("Nothing pending");
    await act(async () => root.unmount());
  });
});
