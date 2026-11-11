// Fair helpers, the owner's side in the admin: the menu from the records, and bringing helper sales in once, after
// their Undo, never below the owner's price, and finishing a claimed sale that couldn't be stored the first time.
import { describe, expect, it } from "vitest";
import { registerSalesForDay } from "@stockroom/fair-mode.js";

import { BRING_IN_AFTER_MS, bringIn, menuFrom, readyToBringIn, stuckSummary, type InboxIO } from "./fairInbox";
import type { StockroomRecords } from "./stockroomData";

const NOW = Date.UTC(2026, 10, 14, 15, 0);
const records = (): StockroomRecords => ({
  books: [
    { id: "salt", title: "Salt Almanac", listPrice: 18, currency: "CAD", coverUrl: "https://shop.example/salt.jpg" },
    { id: "moth", title: "Moth Songs", listPrice: 12, currency: "CAD" },
  ],
  states: { salt: { stock: 10, hist: [] }, moth: { hist: [] } },
  taxCenter: null,
});
const sale = (over: Record<string, unknown> = {}) => ({
  id: "fs-abc-0123456789", by: "sam@example.com", day: "2026-11-14", fair: "Harbour Fair", method: "Cash",
  lines: [{ bookId: "salt", title: "Salt Almanac", qty: 2, price: 18, cur: "CAD" }],
  at: new Date(NOW - BRING_IN_AFTER_MS - 1000).toISOString(), ...over,
});

function memory(start = records(), claims: Record<string, boolean> = {}) {
  const data = JSON.parse(JSON.stringify(start)) as StockroomRecords;
  const log: string[] = [];
  let unfinished: string[] = [];
  let failNext = false;
  const io: InboxIO = {
    load: async () => JSON.parse(JSON.stringify(data)),
    claim: async (id) => { log.push(`claim:${id}`); if (claims[id] === false) return false; claims[id] = false; return true; },
    saveBook: async (id, mutate) => {
      if (failNext) { failNext = false; return { status: "failed", reason: "offline", message: "offline" } as any; }
      const state = mutate(JSON.parse(JSON.stringify(data.states[id] || {})));
      data.states[id] = state as Record<string, unknown>;
      log.push(`save:${id}`);
      return { status: "saved", state, merged: false, conflicts: [], written: ["hist"] } as any;
    },
    unfinished: { read: () => unfinished, write: (ids) => { unfinished = ids; } },
  };
  return { data, log, io, failOnce: () => { failNext = true; }, unfinished: () => unfinished };
}

describe("the helpers' menu", () => {
  it("lists each item's price, currency, copies on hand and cover", () => {
    const menu = menuFrom(records(), "2026-11-14T15:00:00Z");
    expect(menu.books).toEqual([
      { id: "moth", title: "Moth Songs", price: 12, cur: "CAD", onHand: null },
      { id: "salt", title: "Salt Almanac", price: 18, cur: "CAD", onHand: 10, cover: "https://shop.example/salt.jpg" },
    ]);
  });
});

describe("bringing helper sales in", () => {
  it("waits until the helper's Undo has passed, and never takes an undone or waiting sale", () => {
    expect(readyToBringIn(sale() as any, NOW)).toBe(true);
    expect(readyToBringIn(sale({ at: new Date(NOW - 2000).toISOString() }) as any, NOW)).toBe(false);
    expect(readyToBringIn(sale({ cancelled: true }) as any, NOW)).toBe(false);
    expect(readyToBringIn(sale({ imported: { at: "x" } }) as any, NOW)).toBe(false);
    expect(readyToBringIn(sale({ pending: true }) as any, NOW)).toBe(false);
  });

  it("claims the sale, then records it as a till sale the fair summary reads", async () => {
    const m = memory();
    const r = await bringIn([sale() as any], m.io, NOW);
    expect(r).toMatchObject({ brought: 1, stuck: [] });
    expect(m.log).toEqual(["claim:fs-abc-0123456789", "save:salt"]);
    expect(m.data.states.salt.stock).toBe(8);
    const row = (m.data.states.salt.hist as any[])[0];
    expect(row).toMatchObject({ num: "fs-abc-0123456789", chan: "Book Fair", qty: 2, price: 18, date: "2026-11-14", fairHelper: "sam@example.com",
      notes: "Cash (rung up by sam@example.com) · Harbour Fair" });
    const day = registerSalesForDay([{ id: "salt", title: "Salt Almanac", currency: "CAD", hist: m.data.states.salt.hist as unknown[] }], "2026-11-14");
    expect(day.units).toBe(2);
    expect(m.unfinished()).toEqual([]);
  });

  it("brings a sale in once, even when another device claimed it or the item holds it already", async () => {
    const m = memory(records(), { "fs-abc-0123456789": false });
    expect((await bringIn([sale() as any], m.io, NOW)).brought).toBe(0);
    expect(m.log).toEqual(["claim:fs-abc-0123456789"]);

    const twice = memory();
    await bringIn([sale() as any], twice.io, NOW);
    twice.unfinished();
    await bringIn([sale({ id: "fs-abc-0123456789" }) as any], { ...twice.io, claim: async () => true }, NOW);
    expect((twice.data.states.salt.hist as any[]).length).toBe(1);
    expect(twice.data.states.salt.stock).toBe(8);
  });

  it("leaves a sale below the owner's price, or for a removed item, in the inbox and lists it", async () => {
    const m = memory();
    const cheap = sale({ lines: [{ bookId: "salt", title: "Salt Almanac", qty: 1, price: 2, cur: "CAD" }] });
    const gone = sale({ id: "fs-gone-0123456789", lines: [{ bookId: "fern", title: "Fern", qty: 1, price: 9, cur: "CAD" }] });
    const r = await bringIn([cheap as any, gone as any], m.io, NOW);
    expect(r.brought).toBe(0);
    expect(r.stuck.map((s) => s.problem)).toEqual(["below-price", "unknown-book"]);
    expect(m.log).toEqual([]);
    expect(stuckSummary(r.stuck)).toEqual({ stuck: 2, by: ["sam@example.com"], belowPrice: 1 });
    expect(stuckSummary([])).toBeNull();
  });

  it("finishes a claimed sale whose rows couldn't be stored, at the next look", async () => {
    const m = memory();
    m.failOnce();
    const first = await bringIn([sale() as any], m.io, NOW);
    expect(first.brought).toBe(0);
    expect(m.unfinished()).toEqual(["fs-abc-0123456789"]);
    // The server now says it is brought in (claimed), so only this device's note finishes it.
    const second = await bringIn([sale({ imported: { at: "x" } }) as any], m.io, NOW);
    expect(second.brought).toBe(1);
    expect(m.data.states.salt.stock).toBe(8);
    expect(m.unfinished()).toEqual([]);
  });
});
