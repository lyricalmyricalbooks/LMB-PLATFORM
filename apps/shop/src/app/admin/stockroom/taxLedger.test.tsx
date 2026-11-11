// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { changeCategory, editExpense, expenseToForm, isEditableLine, removeExpense } from "./taxLedger";

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

describe("receipts", () => {
  it("reads either the list or the older single address", async () => {
    const { receiptsOf } = await import("./taxLedger");
    expect(receiptsOf({ receiptFiles: ["a", "", 3, "b"] })).toEqual(["a", "b"]);
    expect(receiptsOf({ receipt: "x" })).toEqual(["x"]);
    expect(receiptsOf({})).toEqual([]);
  });

  it("attaches a receipt once, keeping the older field filled", async () => {
    const { attachReceipt } = await import("./taxLedger");
    const once = attachReceipt(tc, "a", "https://r/1");
    expect(once.businessExpenses[0]).toMatchObject({ receipt: "https://r/1", receiptFiles: ["https://r/1"] });
    const twice = attachReceipt(once, "a", "https://r/2");
    expect(twice.businessExpenses[0]).toMatchObject({ receipt: "https://r/1", receiptFiles: ["https://r/1", "https://r/2"] });
    expect(attachReceipt(twice, "a", "https://r/2")).toBe(twice);
    expect(attachReceipt(tc, "gone", "https://r/1")).toBe(tc);
  });

  it("checks the file and builds a path inside the shop's folder", async () => {
    const { receiptProblem, receiptPath } = await import("./receiptUpload");
    expect(receiptProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(receiptProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(receiptProblem({ type: "text/plain", size: 10 })).toMatch(/photo or a PDF/);
    expect(receiptProblem({ type: "image/png", size: 15 * 1024 * 1024 })).toMatch(/15 MB/);
    expect(receiptPath("my receipt (1).jpg", 42)).toMatch(/^shops\/[a-z0-9-]+\/receipts\/General\/42_myreceipt1\.jpg$/);
  });

  it("uploads a picked file and saves its address on the expense", async () => {
    vi.mocked(saveTaxCenter).mockReset();
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: { done: 1 }, note: { tone: "ok", text: "Receipt attached." } });
    document.body.innerHTML = "";
    const upload = vi.fn().mockResolvedValue("https://r/9");
    const onSaved = vi.fn(); const onNote = vi.fn();
    const { container, root } = await mount(<LedgerLineActions line={{ itemId: "a", desc: "Canva", cat: "Other" }} onSaved={onSaved} onNote={onNote} upload={upload} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "r.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => {});
    expect(upload).toHaveBeenCalledWith(file);
    expect(vi.mocked(saveTaxCenter).mock.calls[0][0](tc).businessExpenses[0].receiptFiles).toEqual(["https://r/9"]);
    expect(onSaved).toHaveBeenCalledWith({ done: 1 });
    await act(async () => root.unmount());
  });

  it("says plainly when the upload fails, and saves nothing", async () => {
    vi.mocked(saveTaxCenter).mockReset();
    document.body.innerHTML = "";
    const onNote = vi.fn();
    const { container, root } = await mount(<LedgerLineActions line={{ itemId: "a", desc: "Canva" }} onSaved={vi.fn()} onNote={onNote} upload={vi.fn().mockRejectedValue(new Error("network"))} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "r.png", { type: "image/png" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => {});
    expect(saveTaxCenter).not.toHaveBeenCalled();
    expect(onNote).toHaveBeenLastCalledWith({ tone: "error", text: "The receipt didn't upload. Check your connection and try again." });
    await act(async () => root.unmount());
  });

  it("shows a link instead of Attach when the line has a receipt", async () => {
    document.body.innerHTML = "";
    const { container, root } = await mount(<LedgerLineActions line={{ itemId: "a", desc: "Canva", receiptFiles: ["https://r/1", "https://r/2"] }} onSaved={vi.fn()} onNote={vi.fn()} />);
    expect(container.querySelector("a")?.textContent).toBe("Receipts (2)");
    expect(button("Attach receipt")).toBeUndefined();
    await act(async () => root.unmount());
  });
});

describe("editing a business expense (the old Edit expense window)", () => {
  const tc = { settings: { baseCurrency: "CAD" }, businessExpenses: [{ id: 7, desc: "Booth", cat: "Other", currency: "USD", origCurrency: "USD", amount: 100, origAmount: 100, fxRate: 1.3, baseAmount: 130, date: "2026-03-01", receipt: "https://r/1", amountUnknown: true }] };
  it("changes the words and amount and values it again at the new date's rate, keeping the receipt", () => {
    const form = { ...expenseToForm(tc.businessExpenses[0]), desc: "Booth fee", amount: "120", date: "2026-03-05", trip: " Vienna " };
    expect(expenseToForm(tc.businessExpenses[0]).amount).toBe("");
    const next = editExpense(tc, 7, form, 120, 1.37);
    expect(next.businessExpenses[0]).toMatchObject({ desc: "Booth fee", amount: 120, origAmount: 120, fxRate: 1.37, baseAmount: 164.4, fxMissing: false, date: "2026-03-05", trip: "Vienna", receipt: "https://r/1" });
    expect(next.businessExpenses[0].amountUnknown).toBeUndefined();
  });
  it("with no rate found, it is saved as missing a value (never 1 to 1)", () => {
    const next = editExpense(tc, 7, expenseToForm(tc.businessExpenses[0]), 100, 0);
    expect(next.businessExpenses[0]).toMatchObject({ fxRate: null, baseAmount: null, fxMissing: true });
    expect(editExpense(tc, 99, expenseToForm(tc.businessExpenses[0]), 1, 1)).toBe(tc);
  });
});
