import { describe, expect, it } from "vitest";
import { bookTakings, channelCounts, inChannel, mergeSales, saleTotals, salesCsv, salesCsvName, sinceFor, stockroomSaleRows, websiteSaleRows, type SaleRow } from "./salesList";
import { routeFromHash, hashForRoute } from "./adminRoute";
import { COMBINED_MENU, MENU, NAV, sidebarItems } from "./riso/nav";

const orders: any[] = [
  { id: "o1", paymentStatus: "paid", createdAt: "2026-10-20T15:00:00Z", total: 30, items: [{ title: "Salt Hours", quantity: 2 }], customer: { name: "Ana" } },
  { id: "o2", paymentStatus: "paid", isTest: true, createdAt: "2026-10-21T15:00:00Z", total: 10, items: [] },
  { id: "o3", paymentStatus: "pending", createdAt: "2026-10-22T15:00:00Z", total: 10, items: [] },
  { id: "o4", paymentStatus: "refunded", createdAt: "2026-10-23T15:00:00Z", total: 12, items: [{ title: "A", quantity: 1 }, { title: "B", quantity: 1 }] },
  { id: "o5", paymentStatus: "paid", createdAt: "2026-08-01T15:00:00Z", total: 5, items: [{ title: "Old", quantity: 1 }] },
];
const sales = [
  { key: "a:1", bookId: "harbour", title: "Harbour Lights", date: "2026-10-22", chan: "Book Fair", qty: 3, amount: 45, cur: "CAD", stockist: "", invoice: "" },
  { key: "a:2", bookId: "harbour", title: "Harbour Lights", date: "2026-10-19", chan: "Consignment", qty: 1, amount: 9, cur: "USD", stockist: "Corner Books", invoice: "" },
  { key: "a:3", bookId: "meadow", title: "Meadow", date: "2026-10-18", chan: "Retail", qty: 4, amount: 40, cur: "CAD", stockist: "", invoice: "INV-7" },
];

describe("one list of every sale", () => {
  it("keeps paid website orders, marks refunds and leaves out tests and unpaid attempts", () => {
    const rows = websiteSaleRows(orders, "2026-10-01");
    expect(rows.map((r) => r.orderId)).toEqual(["o1", "o4"]);
    expect(rows[0]).toMatchObject({ channel: "Website", what: "Salt Hours", qty: 2, amount: 30, who: "Ana" });
    expect(rows[1]).toMatchObject({ what: "A and 1 more", amount: 0, refunded: true });
  });

  it("puts the stockroom's sales beside them, newest first, filtered by channel", () => {
    const rows = mergeSales(websiteSaleRows(orders, "2026-10-01"), stockroomSaleRows(sales));
    expect(rows.map((r) => r.key)).toEqual(["web:o4", "stock:a:1", "web:o1", "stock:a:2", "stock:a:3"]);
    expect(rows.find((r) => r.key === "stock:a:3")!.who).toBe("Invoice INV-7");
    const channels = channelCounts(rows);
    expect(channels[0]).toEqual({ id: "website", label: "Website", count: 2 });
    expect(channels.map((c) => c.id)).toContain("fairs-and-markets");
    expect(inChannel(rows, "stockists").map((r) => r.who)).toEqual(["Corner Books"]);
    expect(inChannel(rows, "")).toHaveLength(5);
  });

  it("adds takings up per currency, the shop's own first", () => {
    const rows = mergeSales(websiteSaleRows(orders, "2026-10-01"), stockroomSaleRows(sales));
    expect(saleTotals(rows)).toEqual({ sales: 5, copies: 12, takings: [{ cur: "CAD", amount: 115 }, { cur: "USD", amount: 9 }] });
  });

  it("counts a website order's books only, after discounts and refunds, like a stockroom sale", () => {
    expect(bookTakings({ id: "x", total: 33, subtotal: 30, discount: 5, shipping: 6, tax: 2 } as any)).toBe(25);
    expect(bookTakings({ id: "x", total: 40, shipping: 8, tax: 2, refundedAmountMinor: 2000, checkoutCurrency: "CAD" } as any)).toBe(15);
  });

  it("names the stockroom's own online sales apart from website orders", () => {
    const [row] = stockroomSaleRows([{ ...sales[0], chan: "Website" }]);
    expect(row.channel).toBe("Other online sales");
    expect(channelCounts([row])[0].id).toBe("other-online-sales");
  });

  it("goes back by whole shop days, or to the first sale", () => {
    expect(sinceFor("30", Date.parse("2026-11-03T17:00:00Z"))).toBe("2026-10-05");
    expect(sinceFor("all")).toBe("");
  });

  it("is a page of the combined admin only, under Orders", () => {
    expect(routeFromHash("#sales", true)).toEqual({ tab: "sales" });
    expect(routeFromHash("#sales", false)).toBeNull();
    expect(hashForRoute({ tab: "sales" })).toBe("#sales");
    const orders = sidebarItems(NAV, COMBINED_MENU).find((i) => i.label === "Orders")!;
    expect(orders.children!.slice(0, 3).map((c) => c.label)).toEqual(["Orders", "All sales", "Sales records"]);
    expect(MENU.flatMap((g) => g.pages)).not.toContain("sales");
  });
});

describe("the All sales spreadsheet", () => {
  const rows: SaleRow[] = [
    { key: "w1", date: "2026-10-30", channel: "Website", what: "Harbour Lights", qty: 2, amount: 48, cur: "CAD", who: "Ana", orderId: "LM-1001", refunded: true },
    { key: "s1", date: "2026-10-29", channel: "Fair", what: "=HYPERLINK(\"x\")", qty: 1, amount: 22.5, cur: "USD", who: "", bookId: "b1" },
  ];
  it("has the rows on screen, each in its own currency, with the period and channel on top", () => {
    const csv = salesCsv(rows, { period: "Last 90 days", channel: "Every channel" });
    const lines = csv.split("\n");
    expect(lines[0]).toBe('"All sales · Last 90 days · Every channel"');
    expect(lines[2]).toBe('"Date","What sold","Channel","Who","Quantity","Takings","Currency","Refunded","Order number"');
    expect(lines[3]).toContain('"2026-10-30","Harbour Lights"');
    expect(lines[3]).toContain('"2","48.00","CAD","Yes","LM-1001"');
    expect(lines[4]).toContain('"1","22.50","USD","",""');
    expect(lines).toHaveLength(5);
  });
  it("never lets a cell run as a spreadsheet formula", () => {
    expect(salesCsv(rows, { period: "p", channel: "c" })).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it("uses the shop's words, and a file name that says what's in it", () => {
    const csv = salesCsv([], { period: "p", channel: "c", words: (t) => t.replace(/books?/gi, "products") });
    expect(csv).toContain("Takings are products only");
    expect(salesCsvName("", "90", "2026-11-03")).toBe("all-sales-every-channel-90-2026-11-03.csv");
    expect(salesCsvName("fair", "all", "2026-11-03")).toBe("all-sales-fair-all-2026-11-03.csv");
  });
});
