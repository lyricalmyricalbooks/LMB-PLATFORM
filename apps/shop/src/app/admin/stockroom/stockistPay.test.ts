// Stockists › Mark paid, through the real write layer over the in-memory stockroom (WRITING.md › Testing a page that writes).
import { describe, expect, it } from "vitest";
import { assembleParts, stitchState } from "@stockroom/merge-state.js";

import type { BookState } from "./planSave";
import { buildStockists, markInvoicePaid } from "./stockists";
import { MemoryStockroom } from "./stockroomMemory";
import { createStockroomWriter, describeResult } from "./stockroomWrite";

const book = { id: "b1", title: "B1", maxPrint: 100, currency: "CAD" };
const start = (): BookState => ({
  ...stitchState({ metadata: { stock: 90 } }),
  stores: [{ id: 1, name: "Corner", sent: 10, sold: 4, returned: 0, outstanding: 6, amountOwed: 48 }],
  ledger: [
    { id: 1, type: "Shipment", storeId: 1, storeName: "Corner", date: "2026-10-01", qty: 10, amountDue: 0, status: "OK", sheetsId: "s1" },
    { id: 2, type: "Sale", storeId: 1, storeName: "Corner", date: "2026-10-20", qty: 4, rate: 40, amountDue: 48, status: "pending", sheetsId: "s2" },
  ],
  invoices: [
    { id: "i1", num: "INV-1", status: "sent", total: 48, currency: "CAD", storeName: "Corner", storeId: 1, storeEmail: "corner@example.com", items: [{ _ledgerId: 2 }] },
    { id: "i2", num: "INV-2", status: "sent", total: 30, currency: "EUR", storeName: "Corner", storeId: 1, items: [] },
  ],
});
function shop() {
  const mem = new MemoryStockroom();
  mem.putCatalog([book]);
  mem.putBook("b1", start());
  return mem;
}
const readBack = (mem: MemoryStockroom) => stitchState(assembleParts(mem.parts.get("b1") ?? {}).parts) as Record<string, any>;

describe("mark a stockist's invoice paid", () => {
  it("offers one click only for a sent invoice in the book's own currency", () => {
    const view = buildStockists({ books: [book], states: { b1: start() as any }, taxCenter: null });
    const inv = view.stockists[0].invoices;
    expect(inv.find((i) => i.num === "INV-1")).toMatchObject({ payable: true, bookId: "b1", email: "corner@example.com" });
    expect(inv.find((i) => i.num === "INV-2")?.payable).toBe(false);
  });

  it("saves the invoice, its sale and the stockist's balance, readable by the old app", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", markInvoicePaid("i1", 1000));
    expect(result.status).toBe("saved");
    const back = readBack(mem);
    expect(back.invoices[0]).toMatchObject({ status: "paid", paidAt: 1000 });
    expect(back.ledger[1].status).toBe("paid");
    expect(back.stores[0].amountOwed).toBe(0);
    const view = buildStockists({ books: [book], states: { b1: (result as any).state }, taxCenter: null });
    expect(view.stockists[0].owed).toEqual([]);
  });

  it("refuses a second payment with nothing written", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    await writer.saveBookState("b1", markInvoicePaid("i1", 1000));
    const before = JSON.stringify(readBack(mem));
    await expect(writer.saveBookState("b1", markInvoicePaid("i1", 2000))).rejects.toThrow(/already marked paid/);
    expect(JSON.stringify(readBack(mem))).toBe(before);
  });

  it("keeps another device's sale recorded meanwhile", async () => {
    const mem = shop();
    let once = true;
    const device = mem.device({ beforeCommit: () => {
      if (!once) return;
      once = false;
      const other = readBack(mem);
      other.ledger.push({ id: 3, type: "Sale", storeId: 1, storeName: "Corner", date: "2026-11-01", qty: 1, amountDue: 12, status: "pending", sheetsId: "s3" });
      mem.putBook("b1", other as BookState);
    } });
    const result = await createStockroomWriter(device).saveBookState("b1", markInvoicePaid("i1", 1000));
    expect(result.status).toBe("saved");
    const back = readBack(mem);
    expect(back.ledger.map((e: any) => e.id)).toEqual([1, 2, 3]);
    expect(back.invoices[0].status).toBe("paid");
    expect(describeResult(result).tone).not.toBe("error");
  });

  it("says plainly when it can't save offline", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device({ offline: true })).saveBookState("b1", markInvoicePaid("i1", 1000));
    expect(result.status).toBe("failed");
    expect(readBack(mem).invoices[0].status).toBe("sent");
  });
});
