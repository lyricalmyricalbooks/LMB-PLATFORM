import { describe, expect, it } from "vitest";
import { billPage, billPaperHtml } from "./billPaper";
import type { Bill } from "./platformBilling";

const bill = (extra: Partial<Bill> = {}): Bill => ({
  id: "in_1", number: "COLO-0001", date: "2026-11-01T12:00:00.000Z", covers: null, amount: "CA$44.07", tax: "CA$5.07",
  status: "paid", pdfUrl: "https://pay.stripe.com/x.pdf", pageUrl: null,
  paper: {
    from: { name: "Colophon", address: "1 Example St, Toronto ON", taxNumbers: ["GST/HST number: 987654321RT0001"] },
    to: { name: "Test Press", email: "owner@example.com", address: ["2 Example Ave", "Toronto ON M1M 1M1", "CA"], taxNumbers: ["GST/HST number: 123456789RT0001"] },
    currency: "CAD", lines: [{ words: "Colophon plan <Nov>", amount: "CA$35.00" }, { words: "Running cost", amount: "CA$4.00" }],
    subtotal: "CA$39.00", discount: "", taxes: [{ words: "HST (13%), ON", amount: "CA$5.07" }],
    total: "CA$44.07", paid: "CA$44.07", due: "CA$0.00", paidAt: "2026-11-02T12:00:00.000Z",
  },
  ...extra,
});

describe("a Colophon bill as a page", () => {
  it("keeps every figure, both tax numbers and the tax line by name", () => {
    const html = billPaperHtml(bill());
    for (const words of ["987654321RT0001", "123456789RT0001", "HST (13%), ON", "CA$5.07", "CA$39.00", "Total (CAD)", "CA$44.07", "COLO-0001 · Paid", "2 Example Ave"]) {
      expect(html).toContain(words);
    }
    expect(html).toContain("Colophon plan &lt;Nov&gt;");
    expect(html).not.toContain("<Nov>");
    expect(html).toMatch(/class="strong"><span>Total \(CAD\)/);
  });

  it("shows what is still to pay on an open bill, and nothing for a bill without paper", () => {
    expect(billPaperHtml(bill({ status: "open", paper: { ...bill().paper!, paid: "CA$0.00", due: "CA$44.07" } }))).toContain("Still to pay");
    expect(billPaperHtml(bill({ paper: null }))).toBe("");
  });

  it("is a whole printable page in the Colophon look", () => {
    const page = billPage(bill());
    expect(page).toMatch(/^<!doctype html>/i);
    expect(page).toContain("#a9e8c6");
  });
});
