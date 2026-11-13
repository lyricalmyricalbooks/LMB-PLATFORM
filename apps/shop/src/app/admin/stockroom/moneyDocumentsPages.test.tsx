// @vitest-environment jsdom
// Quotes, Repeating and Bills to pay draw their tiles, rows and one action per row from sample records.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { BillsBoard } from "./BillsPage";
import { QuotesBoard } from "./QuotesPage";
import { RepeatingBoard, monthlyValue } from "./RepeatingPage";
import { repeatList } from "./recurringInvoices";
import type { StockroomRecords } from "./stockroomData";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const records: StockroomRecords = {
  books: [{ id: "a", title: "Salt Hours", currency: "CA$", maxPrint: 200 }],
  states: {
    a: {
      stores: [{ id: 1, name: "Corner Books", email: "corner@example.com" }],
      invoices: [],
      quotes: [
        { id: "q1", num: "Q-2026-001", status: "sent", date: "2026-11-01", validUntil: "2099-12-01", total: 60, currencyCode: "CAD", storeName: "Corner Books", billTo: "store", items: [] },
        { id: "q2", num: "Q-2026-002", status: "draft", date: "2026-11-02", validUntil: "2099-12-01", total: 30, currencyCode: "CAD", storeName: "Fern Shop", billTo: "person", items: [] },
      ],
      recurringInvoices: [
        { id: "r1", status: "active", every: "month", nextDate: "2099-01-05", total: 90, currencyCode: "CAD", storeName: "Corner Books", storeEmail: "corner@example.com", billTo: "store", autoEmail: true, made: [], items: [] },
        { id: "r2", status: "active", every: "week", nextDate: "2099-01-02", total: 12, currencyCode: "CAD", storeName: "Fern Shop", billTo: "person", autoEmail: true, made: [], items: [] },
      ],
    } as any,
  },
  taxCenter: null,
};

async function draw(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => {});
  return container;
}

describe("the money document pages", () => {
  it("Quotes shows what is waiting and the next step for each quote", async () => {
    const page = await draw(<QuotesBoard initial={records} />);
    expect(page.textContent).toContain("Waiting on a reply");
    expect(page.textContent).toContain("Q-2026-001");
    expect(page.textContent).toContain("Make invoice");
    expect(page.textContent).toContain("Mark sent");
  });

  it("Repeating shows a month's billing, the next invoice and a no-email warning", async () => {
    const rows = repeatList(records);
    expect(monthlyValue(rows)).toEqual([{ code: "CAD", amount: 142 }]);
    const page = await draw(<RepeatingBoard initial={records} />);
    expect(page.textContent).toContain("Billed each month");
    expect(page.textContent).toContain("Emailed for you");
    expect(page.textContent).toContain("No email: waits as a draft");
  });

  it("Bills to pay leads with what is late, and a paid bill reads as in your expenses", async () => {
    const tc = { bills: [
      { id: "b1", supplier: "Riso Print Co", desc: "Covers", cat: "Printing & Production", amount: 240, currency: "CAD", dueDate: "2026-11-09", status: "open" },
      { id: "b2", supplier: "Paper Mill", desc: "Stock", cat: "Printing & Production", amount: 80, currency: "CAD", dueDate: "2026-11-01", status: "paid", paidDate: "2026-11-01", paidAt: Date.now(), expenseId: 5 },
    ] };
    const page = await draw(<BillsBoard initial={tc} today="2026-11-11" />);
    expect(page.textContent).toContain("Riso Print Co");
    expect(page.textContent).toContain("2 days late");
    expect(page.textContent).toContain("Mark paid");
    expect(page.textContent).not.toContain("Paper Mill"); // To pay is the first filter
    const empty = await draw(<BillsBoard initial={null} today="2026-11-11" />);
    expect(empty.textContent).toMatch(/bill/i);
  });
});
