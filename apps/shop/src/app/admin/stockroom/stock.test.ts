import { describe, expect, it } from "vitest";
import { deriveOnHand, inventoryBreakdown } from "@stockroom/inventory.js";

import { catalogueStock, itemStock, searchItems, settle, stockLevel, totalsOf } from "./stock";
import type { StockBook, StockroomRecords } from "./stockroomData";

const book = (id: string, extra: object = {}): StockBook => ({ id, title: id, maxPrint: 100, threshold: 10, currency: "$", ...extra });

// A saved count that is stale (999), a voided sale, a consignment shipment with a sale, a write-off, a gift and a held payment.
const records: StockroomRecords = {
  books: [book("salt", { maxPrint: 200 }), book("night", { maxPrint: 150, threshold: 10 }), book("tide", { maxPrint: 60, threshold: 8, currency: "€" }), book("light", { maxPrint: 40, threshold: 5 })],
  states: {
    salt: { stock: 999, hist: [{ id: 1, qty: 120, price: 20, chan: "Website" }, { id: 2, qty: 5, price: 20, chan: "Fair" }, { id: 3, qty: 9, price: 20, chan: "Website", voided: true }], ledger: [], stores: [] },
    night: {
      hist: [{ id: 1, qty: 40, price: 18, chan: "Website" }, { id: 2, qty: 6, price: 18, chan: "Consignment", consignmentLink: true, notes: "Corner Books", date: "2026-10-09" }],
      ledger: [
        { id: "s1", type: "Shipment", storeId: "st1", storeName: "Corner Books", qty: 30, date: "2026-10-05" },
        { id: "s2", type: "Sale", storeId: "st1", storeName: "Corner Books", qty: 6, amountDue: 108, date: "2026-10-09" },
        { id: "s3", type: "Sale", storeId: "st1", storeName: "Corner Books", qty: 2, amountDue: 36, voided: true, date: "2026-10-10" },
        { id: "w1", type: "Inventory Disposal", qty: 4, date: "2026-10-11", status: "written off" },
      ],
      stores: [{ id: "st1", name: "Corner Books", sent: 99, sold: 99, returned: 0, outstanding: 99 }],
    },
    tide: { authorStock: 10, hist: [{ id: 1, qty: 38, price: 12, chan: "Website" }, { id: 2, qty: 2, price: 0, chan: "Gift", gratuity: true }], artistTransfers: [{ chan: "Fair", qty: 4, price: 12, total: 48 }] },
    light: { hist: [{ id: 1, qty: 40, price: 25, chan: "Website" }] },
  },
  taxCenter: null,
};
const get = (id: string) => itemStock(records.books.find((b) => b.id === id)!, records.states[id]);

describe("Stock and sales agrees with the stockroom's own rules", () => {
  it("counts the shelf from the records, never the saved count", () => {
    const salt = get("salt");
    expect(salt.onHand).toBe(75);
    expect(salt.sold).toBe(125); // the voided 9 are not sold
    expect(salt.revenue).toBe(2500);
    // the saved copy is untouched
    expect(records.states.salt.stock).toBe(999);
  });

  it("matches deriveOnHand and inventoryBreakdown on settled records, for every item", () => {
    for (const b of records.books) {
      const settled = settle(b, records.states[b.id]);
      const item = get(b.id);
      expect(item.onHand).toBe(deriveOnHand(settled, b));
      const breakdown = inventoryBreakdown(settled, b);
      expect(item).toMatchObject({ printed: breakdown.printed, directSold: breakdown.directSold, consignSold: breakdown.consignSold, onConsignment: breakdown.onConsignment, writtenOff: breakdown.writtenOff, gratuities: breakdown.gratuities, unaccounted: breakdown.unaccounted });
      // everything printed is somewhere
      expect(item.unaccounted).toBe(0);
    }
  });

  it("tracks copies out at stores from the ledger, with a voided sale left out and stale store counters rebuilt", () => {
    const night = get("night");
    expect(night.onHand).toBe(76); // 150 - 40 sold - 30 shipped - 4 written off
    expect(night.onConsignment).toBe(24);
    expect(night.writtenOff).toBe(4);
    expect(night.sold).toBe(46);
    expect(night.stores).toEqual([{ id: "st1", name: "Corner Books", sent: 30, sold: 6, returned: 0, outstanding: 24 }]);
    expect(night.channels.find((c) => c.chan === "Consignment")).toMatchObject({ units: 6, revenue: 108 });
    expect(night.revenue).toBe(828);
  });

  it("adds the gross an artist collected into revenue and the channel, and separates gifts and the maker's copies", () => {
    const tide = get("tide");
    expect(tide.onHand).toBe(20);
    expect(tide.gratuities).toBe(2);
    expect(tide.sold).toBe(38);
    expect(tide.revenue).toBe(38 * 12 + 48);
    expect(tide.channels.find((c) => c.chan === "Fair")?.revenue).toBe(48);
    expect(tide.authorHeld).toBe(10);
    expect(tide.publisherOnHand).toBe(10);
  });

  it("flags sold out and low by the item's own threshold, and lists them first", () => {
    expect(stockLevel(0, 5)).toBe("soldout");
    expect(stockLevel(5, 5)).toBe("low");
    expect(stockLevel(10, 5)).toBe("watch");
    expect(stockLevel(11, 5)).toBe("ok");
    const order = catalogueStock(records).map((i) => `${i.id}:${i.level}`);
    expect(order[0]).toBe("light:soldout");
    expect(order).toEqual(["light:soldout", "night:ok", "salt:ok", "tide:ok"]);
  });

  it("falls back to the saved count for an item with no print run, and reads a blank record as everything on the shelf", () => {
    const loose = itemStock({ id: "x", title: "X", threshold: 2 } as StockBook, { stock: 7, hist: [] });
    expect(loose.onHand).toBe(7);
    expect(loose.hasPrintRun).toBe(false);
    expect(itemStock(book("fresh"), undefined)).toMatchObject({ onHand: 100, sold: 0, revenue: 0, stores: [], channels: [] });
  });

  it("searches by title or maker and totals revenue per currency", () => {
    const items = catalogueStock({ ...records, books: records.books.map((b) => ({ ...b, author: b.id === "tide" ? "Cleo Example" : "" })) });
    expect(searchItems(items, "cleo").map((i) => i.id)).toEqual(["tide"]);
    expect(searchItems(items, "SALT")).toHaveLength(1);
    expect(searchItems(items, "  ")).toHaveLength(4);
    const totals = totalsOf(catalogueStock(records));
    expect(totals).toMatchObject({ items: 4, onHand: 75 + 76 + 20 + 0, sold: 125 + 46 + 38 + 40, atStores: 24, needAttention: 1 });
    expect(totals.revenue.find((r) => r.code === "EUR")?.amount).toBe(504);
    expect(totals.revenue.find((r) => r.code === "CAD")?.amount).toBe(2500 + 828 + 1000);
  });
});
