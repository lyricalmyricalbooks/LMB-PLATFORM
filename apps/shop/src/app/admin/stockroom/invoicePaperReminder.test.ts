import { describe, expect, test } from "vitest";
import { invoicePaperHtml } from "./invoicePaper";

const settings = { name: "Moth Press", addr: "", email: "", web: "", vat: "", bank: "", footer: "" } as any;
const inv = { num: "INV-12", status: "sent", date: "2026-10-01", dueDate: "2026-11-01", total: 50, subtotal: 50, items: [], paymentLink: "https://press.example/track?invoicePay=x" };

describe("reminder PDF", () => {
  test("a late invoice reads as a reminder, with the pay link", () => {
    const html = invoicePaperHtml(inv, settings, "2026-11-11", { reminder: true });
    expect(html).toContain("Payment reminder");
    expect(html).toContain("10 days ago");
    expect(html).toContain("invoicePay=x");
  });
  test("the plain invoice is unchanged", () => {
    const html = invoicePaperHtml(inv, settings, "2026-11-11");
    expect(html).not.toContain("Payment reminder");
    expect(html).not.toContain("friendly reminder");
  });
});
