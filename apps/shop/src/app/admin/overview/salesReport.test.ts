import { describe, expect, it } from "vitest";
import { salesReportCsv } from "./salesReport";

describe("salesReportCsv", () => {
  it("lists every day with net revenue, tax, shipping and best sellers, injection-safe", () => {
    const csv = salesReportCsv([
      { createdAt: "2026-09-02T10:00:00Z", total: 100, tax: 5, shipping: 10, discount: 4, refundedAmountMinor: 2000, expectedAmountMinor: 10000,
        items: [{ id: "b", title: "=HYPERLINK()", quantity: 2, price: 40 }] },
    ], "2026-09-01", "2026-09-03");
    const lines = csv.split("\n");
    expect(lines[2]).toBe(`"2026-09-01","0","0","0.00","0.00","0.00","0.00","0.00","0.00"`);
    expect(lines[3]).toBe(`"2026-09-02","1","2","100.00","20.00","80.00","5.00","10.00","4.00"`);
    expect(lines[5]).toContain(`"Total","1","2","100.00","20.00","80.00"`);
    expect(csv).toContain(`"'=HYPERLINK()","2","80.00","100.0%"`);
  });
});
