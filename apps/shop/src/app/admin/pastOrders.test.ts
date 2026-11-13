// Orders › Bring past orders over (plan 23.7): the old shop's order file read in the browser.
import { describe, expect, it } from "vitest";
import { mergePastOrderFiles, readPastOrders, readyToSend } from "./pastOrders";

const NOW = new Date("2026-11-03T12:00:00Z");

describe("reading an old shop's order file (plan 23.7)", () => {
  it("one line per item, the order's number repeated and its totals on the first line", () => {
    const file = [
      "Name,Email,Financial Status,Paid at,Fulfillment Status,Currency,Subtotal,Shipping,Taxes,Total,Discount Amount,Created at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Billing Name,Refunded Amount,Cancelled at",
      "#1001,Ada@Example.com,paid,2025-06-01 15:31:00 -0400,fulfilled,CAD,48.00,10.00,6.24,64.24,0.00,2025-06-01 15:30:00 -0400,2,Moth Songs,20.00,MS-1,Ada Lovelace,,",
      "#1001,Ada@Example.com,,,,,,,,,,2025-06-01 15:30:00 -0400,1,Zine,8.00,,,,",
      "#1002,ben@example.com,refunded,,,CAD,30,0,0,30,0,2025-07-02,1,Salt Hours,30,,Ben,,",
      "#1003,cy@example.com,pending,,,CAD,30,0,0,30,0,2025-07-03,1,Salt Hours,30,,Cy,,",
      "#1004,di@example.com,paid,,,USD,30,0,0,30,0,2025-07-04,1,Salt Hours,30,,Di,,",
      "#1005,ed@example.com,paid,,,CAD,30,0,0,30,0,2025-07-05,1,Salt Hours,30,,Ed,,2025-07-06",
      "#1006,ada@example.com,partially_refunded,,,CAD,30,0,0,30,5,2025-08-01,1,Salt Hours,30,,Ada Lovelace,10,",
    ].join("\n");
    const out = readPastOrders(file, NOW);
    expect(out.problems).toEqual([]);
    expect(out.orders[0]).toEqual({
      oldRef: "order:#1001", number: "#1001", orderedAt: "2025-06-01T19:30:00.000Z", email: "ada@example.com", name: "Ada Lovelace", currency: "CAD",
      items: [{ title: "Moth Songs", quantity: 2, price: 20, sku: "MS-1" }, { title: "Zine", quantity: 1, price: 8 }],
      subtotal: 48, shipping: 10, tax: 6.24, discount: 0, total: 64.24,
    });
    expect(out.orders[1]).toMatchObject({ number: "#1002", orderedAt: "2025-07-02", refunded: 30 });
    expect(out.orders[3]).toMatchObject({ number: "#1006", refunded: 10, discount: 5 });
    expect(out.skipped.map((s) => s.reason)).toEqual([
      "Order #1003: it was pending, so it never became a sale",
      "Order #1005: it was cancelled, so it never became a sale",
    ]);
    expect(out.foreign).toEqual({ USD: 1 });
    // Without a rate the other-currency order waits and counts in nothing.
    expect(readyToSend(out, {})).toMatchObject({ waiting: { USD: 1 }, totalSales: 84.24, customers: 2, from: "2025-06-01", to: "2025-08-01" });
    expect(readyToSend(out, { USD: 0 }).waiting).toEqual({ USD: 1 });
    // With the owner's rate (plan 23.11) every amount is in Canadian dollars and what the old shop charged is kept.
    const ready = readyToSend(out, { USD: 1.4 });
    expect(ready.waiting).toEqual({});
    expect(ready.orders.find((o) => o.number === "#1004")).toMatchObject({
      currency: "CAD", total: 42, subtotal: 42, shipping: 0, items: [{ title: "Salt Hours", quantity: 1, price: 42 }], paidIn: { currency: "USD", total: 30, rate: 1.4 },
    });
    expect(ready).toMatchObject({ totalSales: 126.24, customers: 3 });
  });

  it("one line per order with the customer's first and last name, and a total only", () => {
    const file = "Order Number,Order Date,Order Status,Billing First Name,Billing Last Name,Billing Email Address,Order Total,Shipping Total\n77,2025-03-04 10:00:00,completed,Flo,Ng,flo@example.com,22.50,5\n78,2025-03-05,processing,Gus,,,12,0";
    const out = readPastOrders(file, NOW);
    expect(out.orders.map((o) => [o.number, o.name, o.email, o.total, o.items])).toEqual([["77", "Flo Ng", "flo@example.com", 22.5, []], ["78", "Gus", undefined, 12, []]]);
    expect(readyToSend(out, {}).customers).toBe(1);
  });

  it("reads a discount or refund written as a negative amount, and amounts with a currency sign", () => {
    const file = [
      "Order ID,Date,Status,Subtotal,Discount,Total,Refunded,Currency",
      "21,2025-05-01,partially refunded,40.00,-5.00,35.00,-10.00,CAD",
      "22,2025-05-02,partially refunded,CA$40.00,($5.00),CA$35.00,(10.00),CAD",
      "23,2025-05-03,paid,US$40.00,-US$5.00,US$35.00,,USD",
      "24,2025-05-04,paid,€40,00,-€5,00,€35,00,,EUR",
    ].join("\n").replace("€40,00,-€5,00,€35,00", '"€40,00","-€5,00","€35,00"');
    const out = readPastOrders(file, NOW);
    expect(out.skipped).toEqual([]);
    expect(out.orders.map((o) => [o.number, o.subtotal, o.discount, o.total, o.refunded])).toEqual([
      ["21", 40, 5, 35, 10], ["22", 40, 5, 35, 10], ["23", 40, 5, 35, undefined], ["24", 40, 5, 35, undefined],
    ]);
    // A negative total is still no sale.
    expect(readPastOrders("Order ID,Date,Total\n30,2025-01-01,-5.00", NOW).skipped.map((s) => s.reason)).toEqual(["Order 30: its total couldn't be read"]);
  });

  it("names the first and last order day in the shop's own time, so a late-evening order stays on its day", () => {
    const out = readPastOrders("Name,Created at,Total\n#1,2025-10-01 09:00:00 -0400,10\n#2,2025-10-31 23:30:00 -0400,10\n#3,2025-10-15,10", NOW);
    expect(readyToSend(out, {})).toMatchObject({ from: "2025-10-01", to: "2025-10-31" });
  });

  it("says plainly when a file isn't a list of orders, and skips lines with no number or a bad date", () => {
    expect(readPastOrders("", NOW).problems).toEqual(["This file is empty."]);
    expect(readPastOrders("Title,Price\nBook,10", NOW).problems[0]).toMatch(/number, its date and its total/);
    const out = readPastOrders("Order ID,Date,Total\n,2025-01-01,5\n9,someday,5\n10,2027-01-01,5\n11,2025-01-01,abc", NOW);
    expect(out.skipped.map((s) => s.reason)).toEqual(["no order number", "Order 9: its date couldn't be read", "Order 10: its date is in the future", "Order 11: its total couldn't be read"]);
  });
});

describe("several order files as one (plan 23.27)", () => {
  it("brings each order once, counts currencies across files and names the file of anything left out", () => {
    const y1 = readPastOrders("Name,Created at,Total,Currency\n#1,2024-06-01,10.00,CAD\n#2,2024-07-01,20.00,USD\n,2024-07-02,5.00,CAD");
    const y2 = readPastOrders("Name,Created at,Total,Currency\n#2,2024-07-01,20.00,USD\n#3,2025-01-05,30.00,USD");
    const both = mergePastOrderFiles([{ name: "2024.csv", file: y1 }, { name: "2025.csv", file: y2 }]);
    expect(both.orders.map((o) => o.number)).toEqual(["#1", "#2", "#3"]);
    expect(both.foreign).toEqual({ USD: 2 });
    expect(both.skipped.map((s) => s.reason)).toEqual(["2024.csv, line 4: no order number"]);
    const bad = mergePastOrderFiles([{ name: "2024.csv", file: y1 }, { name: "notes.csv", file: readPastOrders("") }]);
    expect(bad.problems).toEqual(["notes.csv: This file is empty."]);
    // One file reads exactly as before.
    expect(mergePastOrderFiles([{ name: "2024.csv", file: y1 }])).toBe(y1);
  });
});

describe("past orders in a shop that sells in US dollars", () => {
  const file = "Name,Email,Created at,Total,Currency,Lineitem name,Lineitem quantity,Lineitem price\n#1,a@example.com,2025-06-01,30.00,USD,Zine,1,30.00\n#2,b@example.com,2025-06-02,40.00,CAD,Book,1,40.00\n";

  it("counts Canadian dollars as the other currency and converts them into US dollars", () => {
    const out = readPastOrders(file, new Date("2026-11-13T12:00:00Z"), "USD");
    expect(out.foreign).toEqual({ CAD: 1 });
    expect(readyToSend(out, {}, "USD")).toMatchObject({ waiting: { CAD: 1 }, totalSales: 30 });
    const ready = readyToSend(out, { CAD: 0.73 }, "USD");
    expect(ready.totalSales).toBeCloseTo(59.2);
    expect(ready.orders[1]).toMatchObject({ currency: "USD", total: 29.2, paidIn: { currency: "CAD", total: 40, rate: 0.73 } });
    expect(ready.orders[0].paidIn).toBeUndefined();
    expect(mergePastOrderFiles([{ name: "a", file: out }, { name: "b", file: out }], "USD").foreign).toEqual({ CAD: 1 });
  });
});
