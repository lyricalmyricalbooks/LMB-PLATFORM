// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { changeCategory, isEditableLine, removeExpense } from "./taxLedger";

vi.mock("./saveTaxCenter", () => ({ saveTaxCenter: vi.fn() }));
import { saveTaxCenter } from "./saveTaxCenter";
import { LedgerLineActions } from "./LedgerLineActions";

const tc = { businessExpenses: [{ id: "a", desc: "Canva", cat: "Other", amount: 12 }, { id: "b", desc: "Ink", cat: "Printing & Production" }], keep: 1 };

describe("ledger line rules", () => {
  it("edits only business expense lines with an id", () => {
    expect(isEditableLine({ sourceType: "businessExpense", itemId: "a" })).toBe(true);
    expect(isEditableLine({ sourceType: "sale", itemId: "a" })).toBe(false);
    expect(isEditableLine({ sourceType: "businessExpense", itemId: "" })).toBe(false);
  });

  it("moves one expense to another category and keeps everything else", () => {
    const out = changeCategory(tc, "a", "Software & Subscriptions");
    expect(out.businessExpenses[0]).toEqual({ id: "a", desc: "Canva", cat: "Software & Subscriptions", amount: 12 });
    expect(out.businessExpenses[1]).toBe(tc.businessExpenses[1]);
    expect(out.keep).toBe(1);
    expect(changeCategory(tc, "a", "Other")).toBe(tc);
    expect(changeCategory(tc, "gone", "Other")).toBe(tc);
  });

  it("removes one expense, and does nothing when it is already gone", () => {
    expect(removeExpense(tc, "a").businessExpenses.map((e: { id: string }) => e.id)).toEqual(["b"]);
    expect(removeExpense(tc, "gone")).toBe(tc);
    expect(removeExpense(null, "a")).toEqual({});
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, root };
}
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("ledger line controls", () => {
  beforeEach(() => { vi.mocked(saveTaxCenter).mockReset(); document.body.innerHTML = ""; });

  it("saves a new category and says so", async () => {
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: { saved: true }, note: { tone: "ok", text: "Moved to Travel." } });
    const onSaved = vi.fn(); const onNote = vi.fn();
    const { container, root } = await mount(<LedgerLineActions line={{ itemId: "a", desc: "Canva", cat: "Other" }} onSaved={onSaved} onNote={onNote} />);
    const select = container.querySelector("select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "Travel");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledWith({ saved: true });
    const mutate = vi.mocked(saveTaxCenter).mock.calls[0][0];
    expect(mutate(tc).businessExpenses[0].cat).toBe("Travel");
    expect(onNote).toHaveBeenLastCalledWith({ tone: "ok", text: "Moved to Travel." });
    await act(async () => root.unmount());
  });

  it("asks before removing, and removes nothing on cancel", async () => {
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: {}, note: { tone: "ok", text: "Expense removed." } });
    const { root } = await mount(<LedgerLineActions line={{ itemId: "a", desc: "Canva", cat: "Other" }} onSaved={vi.fn()} onNote={vi.fn()} />);
    await act(async () => { button("Remove")!.click(); });
    await act(async () => { button("Cancel")!.click(); });
    expect(saveTaxCenter).not.toHaveBeenCalled();
    await act(async () => { button("Remove")!.click(); });
    await act(async () => { button("Remove expense")!.click(); });
    await act(async () => {});
    expect(saveTaxCenter).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveTaxCenter).mock.calls[0][0](tc).businessExpenses).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
