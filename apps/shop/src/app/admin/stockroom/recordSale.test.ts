import { describe, expect, it } from "vitest";
import { assembleParts, stitchState } from "@stockroom/merge-state.js";
import { recomputeAfters } from "@stockroom/recompute-afters.js";

import type { BookState } from "./planSave";
import { addSale, blankSale, checkSale, newSaleId, SaleRefusal, voidBlock, voidSale, type SaleForm } from "./recordSale";
import { MemoryStockroom } from "./stockroomMemory";
import { createStockroomWriter, describeResult, type BookSaved } from "./stockroomWrite";

const book = { id: "b1", title: "Salt Hours", maxPrint: 50, listPrice: 20, currency: "CAD" };
const books = [book, { id: "b2", title: "Night Songs", maxPrint: 10 }];
const form = (patch: Partial<SaleForm> = {}): SaleForm => ({ bookId: "b1", qty: "2", price: "20", chan: "Direct", date: "2026-11-01", num: "", notes: "", ...patch });
const old = (n: number, extra: object = {}) => ({ num: `O${n}`, chan: "Website", qty: 1, price: 20, date: `2026-10-0${n}`, notes: "", sheetsId: `web-${n}`, ...extra });

function shop(hist: object[] = [old(1)]) {
  const mem = new MemoryStockroom();
  mem.putCatalog(books);
  const state: BookState = { ...stitchState({}), hist: JSON.parse(JSON.stringify(hist)) };
  recomputeAfters(state, book);
  mem.putBook("b1", state);
  return mem;
}
const stored = (mem: MemoryStockroom) => stitchState(assembleParts(mem.parts.get("b1") ?? {}).parts);
const valid = (f: SaleForm) => { const c = checkSale(f, books); if (!c.ok) throw new Error(JSON.stringify(c.errors)); return c.sale; };

describe("the Record a sale form", () => {
  it("starts on today with the only item and its price", () => {
    expect(blankSale([book], "2026-11-11")).toMatchObject({ bookId: "b1", price: "20", qty: "1", date: "2026-11-11", chan: "Direct" });
    expect(blankSale(books, "2026-11-11").bookId).toBe("");
  });

  it("accepts a whole sale and rounds the price to cents", () => {
    expect(checkSale(form({ price: "19.5", num: " A-1 ", notes: " signed " }), books)).toEqual({ ok: true, sale: { bookId: "b1", qty: 2, price: 19.5, chan: "Direct", date: "2026-11-01", num: "A-1", notes: "signed" } });
  });

  it("names each problem in plain words", () => {
    const c = checkSale(form({ bookId: "", qty: "1.5", price: "-1", chan: "Nowhere", date: "2999-01-01" }), books, (s) => s.replace("book", "product"));
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.errors.bookId).toMatch(/product/);
    expect(Object.keys(c.errors).sort()).toEqual(["bookId", "chan", "date", "price", "qty"]);
    const cents = checkSale(form({ price: "1.234" }), books);
    expect(!cents.ok && cents.errors.price).toMatch(/two decimals/);
  });

  it("refuses more copies than are on hand", () => {
    const c = checkSale(form({ qty: "5" }), books, undefined, 3);
    expect(!c.ok && c.errors.qty).toMatch(/Only 3/);
  });

  it("makes record ids in the stockroom's own form", () => {
    expect(newSaleId(0, () => 0.5)).toMatch(/^evt-0-/);
  });
});

describe("saving a sale", () => {
  it("adds the row the stockroom adds, with its totals rebuilt by the stockroom's own rules", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    const result = await writer.saveBookState("b1", addSale(valid(form()), book, "evt-x", undefined, new Date("2026-11-11T10:00:00Z")));
    expect(result.status).toBe("saved");
    const state = stored(mem);
    expect(state).toEqual((result as BookSaved).state);
    const row = (state.hist as Array<Record<string, unknown>>)[0];
    expect(row).toMatchObject({ num: "", chan: "Direct", qty: 2, price: 20, date: "2026-11-01", enteredBy: "Publisher", sheetsId: "evt-x", cur: "CAD", payment: null, recordedAt: "2026-11-11T10:00:00.000Z" });
    expect(state.stock).toBe(47);
    expect(state.sold).toBe(3);
    expect(state.revenue).toBe(60);
    expect((state.chStats as Record<string, { units: number }>).Direct.units).toBe(2);
    // the running count is the stockroom's: oldest first, 49 then 47
    expect((state.hist as Array<{ after: number }>).map((h) => h.after)).toEqual([47, 49]);
  });

  it("the same sale sent twice is one sale", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    const sale = valid(form());
    await writer.saveBookState("b1", addSale(sale, book, "evt-same"));
    const again = await writer.saveBookState("b1", addSale(sale, book, "evt-same"));
    expect(again.status).toBe("unchanged");
    expect((stored(mem).hist as unknown[]).length).toBe(2);
  });

  it("keeps a sale another device recorded at the same moment, and the totals count both", async () => {
    const mem = shop();
    let once = false;
    const writer = createStockroomWriter(mem.device({
      beforeCommit: () => {
        if (once) return; once = true;
        const other = stored(mem);
        (other.hist as object[]).unshift(old(5, { qty: 3 }));
        recomputeAfters(other, book);
        mem.putBook("b1", other);
      },
    }));
    const result = await writer.saveBookState("b1", addSale(valid(form()), book, "evt-mine"));
    expect(result.status).toBe("saved");
    expect((result as BookSaved).merged).toBe(true);
    const state = stored(mem);
    expect((state.hist as Array<{ sheetsId: string }>).map((h) => h.sheetsId).sort()).toEqual(["evt-mine", "web-1", "web-5"]);
    expect(state.stock).toBe(44);
    expect(state.revenue).toBe(120);
  });

  it("refuses a sale bigger than what is on hand now, and writes nothing", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    await expect(writer.saveBookState("b1", addSale(valid(form({ qty: "60" })), book, "evt-big"))).rejects.toBeInstanceOf(SaleRefusal);
    expect(mem.log).toEqual([]);
  });

  it("a failed save offers the change again, and sending it later stores it once", async () => {
    const mem = shop();
    const failed = await createStockroomWriter(mem.device({ failCommit: new Error("network") })).saveBookState("b1", addSale(valid(form()), book, "evt-later"));
    expect(failed.status).toBe("failed");
    if (failed.status !== "failed" || !failed.pending) throw new Error("expected a kept change");
    expect(describeResult(failed).tone).toBe("error");
    const retried = await createStockroomWriter(mem.device()).commitBookState(failed.pending);
    expect(retried.status).toBe("saved");
    expect((stored(mem).hist as unknown[]).length).toBe(2);
  });

  it("a team member is refused", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device({ role: "staff" })).saveBookState("b1", addSale(valid(form()), book, "evt-staff"));
    expect(result.status === "refused" || result.status === "failed").toBe(true);
    expect(mem.log).toEqual([]);
  });
});

describe("voiding a sale", () => {
  it("marks it voided, never removes it, and takes it out of every total", async () => {
    const mem = shop([old(2), old(1)]);
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", voidSale(old(2), undefined, 123));
    expect(result.status).toBe("saved");
    const state = stored(mem);
    expect((state.hist as unknown[]).length).toBe(2);
    expect((state.hist as Array<Record<string, unknown>>)[0]).toMatchObject({ sheetsId: "web-2", voided: true, voidedAt: 123 });
    expect(state.stock).toBe(49);
    expect(state.sold).toBe(1);
    expect(state.revenue).toBe(20);
  });

  it("a sale another device voided first is left as it is", async () => {
    const mem = shop([old(1, { voided: true, voidedAt: 5 })]);
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", voidSale(old(1)));
    expect(result.status).toBe("unchanged");
  });

  it("sales the stockroom must void itself are refused with the reason", () => {
    expect(voidBlock(old(1, { webOrderId: "w1" }))).toMatch(/website/);
    expect(voidBlock(old(1, { consignmentLink: "l1" }))).toMatch(/stockist/);
    expect(voidBlock(old(1, { enteredBy: "Artist" }), (s) => s.replace("author", "maker"))).toMatch(/maker/);
    expect(voidBlock({ qty: 1 })).toMatch(/record number/);
    expect(voidBlock(old(1))).toBeNull();
  });

  it("a sale that has gone is refused, not guessed at", async () => {
    const mem = shop();
    await expect(createStockroomWriter(mem.device()).saveBookState("b1", voidSale(old(9)))).rejects.toBeInstanceOf(SaleRefusal);
    expect(mem.log).toEqual([]);
  });
});
