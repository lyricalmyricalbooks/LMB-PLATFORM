// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./saveTaxCenter", () => ({ saveTaxCenter: vi.fn() }));
import { saveTaxCenter } from "./saveTaxCenter";
import { detachReceipt, markedNoReceipt, receiptVault, setNoReceiptNeeded } from "./taxLedger";
import { ReceiptsVaultCard } from "./ReceiptsVault";

const rows = [
  { sourceType: "businessExpense", itemId: "a", desc: "Canva", date: "2026-03-01", baseAmount: 12, receiptFiles: ["https://r/1", "https://r/2"] },
  { sourceType: "businessExpense", itemId: "b", desc: "Ink", date: "2026-03-02", baseAmount: 40 },
  { sourceType: "businessExpense", itemId: "c", desc: "Rent", date: "2026-03-03", baseAmount: 900, receiptExempt: true },
  { sourceType: "businessExpense", itemId: "d", desc: "Voided", date: "2026-03-04", baseAmount: 5, voided: true },
  { sourceType: "bookExpense", itemId: "e", desc: "Print run", date: "2026-03-05", baseAmount: 300, receipt: "https://r/3" },
  { sourceType: "sale", itemId: "f", desc: "Sale", date: "2026-03-06", baseAmount: 20, isIncome: true },
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, root };
}
const money = (n: number) => `$${n.toFixed(2)}`;

describe("receipts vault", () => {
  beforeEach(() => { vi.mocked(saveTaxCenter).mockReset(); document.body.innerHTML = ""; });

  it("lists lines with receipts as kept, and only open business expenses as missing", () => {
    const { kept, missing } = receiptVault(rows);
    expect(kept.map((r) => r.itemId)).toEqual(["a", "e"]);
    expect(missing.map((r) => r.itemId)).toEqual(["b"]);
  });

  it("shows counts and every receipt link on the Kept tab", async () => {
    const { container, root } = await mount(<ReceiptsVaultCard rows={rows} money={money} />);
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Kept2", "Missing1"]);
    const links = [...container.querySelectorAll("#rp-panel-vault-kept a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["https://r/1", "https://r/2", "https://r/3"]);
    expect(container.querySelector("#rp-panel-vault-missing")?.hasAttribute("hidden")).toBe(true);
    await act(async () => root.unmount());
  });

  it("offers Attach receipt only when it can save", async () => {
    const view = await mount(<ReceiptsVaultCard rows={rows} money={money} />);
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    await act(async () => view.root.unmount());
    const live = await mount(<ReceiptsVaultCard rows={rows} money={money} onSaved={vi.fn()} />);
    expect(live.container.querySelectorAll('#rp-panel-vault-missing input[type="file"]')).toHaveLength(1);
    await act(async () => live.root.unmount());
  });

  it("uploads a receipt for a missing expense and saves it on that expense", async () => {
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: { done: 1 }, note: { tone: "ok", text: "Receipt attached." } });
    const upload = vi.fn().mockResolvedValue("https://r/9");
    const onSaved = vi.fn();
    const { container, root } = await mount(<ReceiptsVaultCard rows={rows} money={money} onSaved={onSaved} upload={upload} />);
    const input = container.querySelector('#rp-panel-vault-missing input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => {});
    expect(upload).toHaveBeenCalledWith(file);
    const tc = { businessExpenses: [{ id: "b", desc: "Ink" }] };
    expect(vi.mocked(saveTaxCenter).mock.calls[0][0](tc).businessExpenses[0].receiptFiles).toEqual(["https://r/9"]);
    expect(onSaved).toHaveBeenCalledWith({ done: 1 });
    expect(container.textContent).toContain("Receipt attached.");
    await act(async () => root.unmount());
  });

  it("opens on Missing when nothing is kept yet", async () => {
    const { container, root } = await mount(<ReceiptsVaultCard rows={[rows[1]]} money={money} />);
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe("Missing1");
    await act(async () => root.unmount());
  });

  it("takes one receipt off, moving the older field to the next one left", () => {
    const tc = { businessExpenses: [{ id: "a", receipt: "https://r/1", receiptFiles: ["https://r/1", "https://r/2"] }], keep: 1 };
    const out = detachReceipt(tc, "a", "https://r/1");
    expect(out.businessExpenses[0]).toEqual({ id: "a", receipt: "https://r/2", receiptFiles: ["https://r/2"] });
    expect(out.keep).toBe(1);
    expect(detachReceipt(out, "a", "https://r/2").businessExpenses[0]).toEqual({ id: "a", receipt: "", receiptFiles: [] });
    expect(detachReceipt(tc, "a", "https://r/9")).toBe(tc);
    expect(detachReceipt(tc, "gone", "https://r/1")).toBe(tc);
    const old = { businessExpenses: [{ id: "b", receipt: "https://r/5" }] };
    expect(detachReceipt(old, "b", "https://r/5").businessExpenses[0]).toEqual({ id: "b", receipt: "", receiptFiles: [] });
  });

  it("removes a receipt from a business expense only after a confirm", async () => {
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: { done: 2 }, note: { tone: "ok", text: "Receipt removed." } });
    const onSaved = vi.fn();
    const { container, root } = await mount(<ReceiptsVaultCard rows={rows} money={money} onSaved={onSaved} />);
    const removes = [...container.querySelectorAll("#rp-panel-vault-kept button")].filter((b) => b.textContent === "Remove");
    expect(removes).toHaveLength(2);
    expect(removes[1].getAttribute("aria-label")).toBe("Remove receipt 2 from Canva");
    await act(async () => { (removes[1] as HTMLButtonElement).click(); });
    expect(saveTaxCenter).not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent === "Remove receipt") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    await act(async () => {});
    const tc = { businessExpenses: [{ id: "a", receiptFiles: ["https://r/1", "https://r/2"] }] };
    expect(vi.mocked(saveTaxCenter).mock.calls[0][0](tc).businessExpenses[0].receiptFiles).toEqual(["https://r/1"]);
    expect(onSaved).toHaveBeenCalledWith({ done: 2 });
    expect(container.textContent).toContain("Receipt removed.");
    await act(async () => root.unmount());
  });

  it("offers no Remove on read-only pages or for an item's own costs", async () => {
    const { container, root } = await mount(<ReceiptsVaultCard rows={rows} money={money} />);
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Remove")).toBe(false);
    await act(async () => root.unmount());
  });

  it("marks an expense as needing no receipt and takes the mark back, leaving rent alone", () => {
    const tc = { businessExpenses: [{ id: "b", desc: "Bank fee" }, { id: "r", desc: "Studio", isRent: true, receiptExempt: true }], keep: 1 };
    const on = setNoReceiptNeeded(tc, "b", true);
    expect(on.businessExpenses[0]).toEqual({ id: "b", desc: "Bank fee", receiptExempt: true });
    expect(on.keep).toBe(1);
    expect(setNoReceiptNeeded(on, "b", true)).toBe(on);
    expect(setNoReceiptNeeded(on, "b", false).businessExpenses[0]).toEqual({ id: "b", desc: "Bank fee" });
    expect([...markedNoReceipt(on)]).toEqual(["b"]);
    expect(setNoReceiptNeeded(tc, "gone", true)).toBe(tc);
  });

  it("No receipt needed saves the mark, and Not needed lists it with a way back", async () => {
    vi.mocked(saveTaxCenter).mockResolvedValue({ ok: true, taxCenter: { done: 3 }, note: { tone: "ok", text: "Marked as needing no receipt." } });
    const onSaved = vi.fn();
    const first = await mount(<ReceiptsVaultCard rows={rows} money={money} onSaved={onSaved} taxCenter={{ businessExpenses: [] }} />);
    expect([...first.container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Kept2", "Missing1"]);
    const btn = [...first.container.querySelectorAll("#rp-panel-vault-missing button")].find((b) => b.textContent === "No receipt needed") as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await act(async () => {});
    expect(vi.mocked(saveTaxCenter).mock.calls[0][0]({ businessExpenses: [{ id: "b" }] }).businessExpenses[0].receiptExempt).toBe(true);
    expect(onSaved).toHaveBeenCalledWith({ done: 3 });
    await act(async () => first.root.unmount());

    const marked = rows.map((r) => (r.itemId === "b" ? { ...r, receiptExempt: true } : r));
    const after = await mount(<ReceiptsVaultCard rows={marked} money={money} onSaved={onSaved} taxCenter={{ businessExpenses: [{ id: "b", receiptExempt: true }, { id: "c", isRent: true, receiptExempt: true }] }} />);
    expect([...after.container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Kept2", "Missing0", "Not needed1"]);
    expect(after.container.querySelector("#rp-panel-vault-notNeeded")?.textContent).toContain("Ink");
    expect(after.container.querySelector("#rp-panel-vault-notNeeded")?.textContent).not.toContain("Rent");
    const back = [...after.container.querySelectorAll("#rp-panel-vault-notNeeded button")].find((b) => b.textContent === "Needs one after all") as HTMLButtonElement;
    await act(async () => { back.click(); });
    await act(async () => {});
    expect(vi.mocked(saveTaxCenter).mock.calls[1][0]({ businessExpenses: [{ id: "b", receiptExempt: true }] }).businessExpenses[0]).toEqual({ id: "b" });
    await act(async () => after.root.unmount());
  });
});
