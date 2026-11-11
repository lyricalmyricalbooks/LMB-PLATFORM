// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./stockroomWrite", () => ({
  stockroomWriteApi: { updateSetting: vi.fn() },
  describeResult: () => ({ tone: "ok", text: "Saved." }),
}));
import { stockroomWriteApi } from "./stockroomWrite";
import { addExpenseLines, loggable, readExpenseLines } from "./taxExpenseLines";
import { LogSeveralCard } from "./LogSeveral";

const tc = {
  settings: { baseCurrency: "CAD" },
  expenseRules: [{ id: 1, match: "canva", cat: "Software & Subscriptions" }],
  businessExpenses: [{ id: 9, date: "2026-11-01", desc: "Ink", amount: 38, origAmount: 38 }],
};
const opts = { taxCenter: tc, base: "CAD", today: "2026-11-10", cat: "Other" };

describe("reading expense lines", () => {
  it("reads date, words and amount, with today when there is no date", () => {
    const lines = readExpenseLines("2026-11-03, Canva, 16.99\n\nPrinter paper, $1,200.50\n2026-11-04\tCanada Post\t42.10", opts);
    expect(lines.map((l) => [l.line, l.form.date, l.form.desc, l.amount, l.form.cat])).toEqual([
      [1, "2026-11-03", "Canva", 16.99, "Software & Subscriptions"],
      [3, "2026-11-10", "Printer paper", 1200.5, "Other"],
      [4, "2026-11-04", "Canada Post", 42.1, "Other"],
    ]);
    expect(lines[0].ruled).toBe(true);
    expect(loggable(lines)).toHaveLength(3);
  });

  it("says what is wrong, and marks what is already logged or repeated", () => {
    const lines = readExpenseLines("Just words\n2026-11-01, Ink, 38\n, 12\nStamps, 5\nStamps, 5", opts);
    expect(lines.map((l) => l.problem || (l.duplicate ? "dup" : "ok"))).toEqual(["No amount at the end of the line.", "dup", "Say what it was for.", "ok", "dup"]);
    expect(loggable(lines).map((l) => l.form.desc)).toEqual(["Stamps"]);
  });

  it("adds every ready line in one change, and a retry adds none twice", () => {
    const lines = readExpenseLines("Canva, 16.99\nStamps, 5", opts);
    const once = addExpenseLines(tc, lines, 1000, new Date("2026-11-10T12:00:00Z"));
    expect(once.businessExpenses.map((e: { desc: string }) => e.desc)).toEqual(["Stamps", "Canva", "Ink"]);
    expect(once.businessExpenses[1]).toMatchObject({ id: 1000, cat: "Software & Subscriptions", amount: 16.99, baseAmount: 16.99, currency: "CAD" });
    expect(addExpenseLines(once, lines, 1000).businessExpenses).toHaveLength(3);
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const typeInto = (el: HTMLTextAreaElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Log several at once card", () => {
  beforeEach(() => { vi.mocked(stockroomWriteApi.updateSetting).mockReset(); document.body.innerHTML = ""; localStorage.clear(); });

  it("previews the lines and logs the ready ones in one save", async () => {
    vi.mocked(stockroomWriteApi.updateSetting).mockImplementation(async (_k: string, fn: (c: unknown) => unknown) => ({ status: "saved", value: fn(tc), merged: false }) as never);
    const onSaved = vi.fn();
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<LogSeveralCard taxCenter={tc} onSaved={onSaved} today="2026-11-10" />));
    const button = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Log ")) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    await act(async () => typeInto(container.querySelector("textarea")!, "Canva, 16.99\nno amount here\n2026-11-01, Ink, 38"));
    expect(container.textContent).toContain("No amount at the end of the line.");
    expect(container.textContent).toContain("Already logged");
    expect(button().textContent).toBe("Log 1 expense (16.99 CAD)");
    await act(async () => { button().click(); });
    expect(stockroomWriteApi.updateSetting).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0].businessExpenses.map((e: { desc: string }) => e.desc)).toEqual(["Canva", "Ink"]);
    expect(container.textContent).toContain("Logged 1 expense.");
    expect(container.querySelector("textarea")!.value).toBe("");
    await act(async () => root.unmount());
  });
});
