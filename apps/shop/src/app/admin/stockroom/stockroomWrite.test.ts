import { describe, expect, it, vi } from "vitest";
import { ALL_PARTS, assembleParts, splitState, stitchState } from "@stockroom/merge-state.js";
import { recomputeAfters } from "@stockroom/recompute-afters.js";

import type { BookState } from "./planSave";
import { MemoryStockroom } from "./stockroomMemory";
import { catalogBooks, loadStockroom } from "./stockroomData";
import { createStockroomWriter, describeResult, type BookSaved } from "./stockroomWrite";

const book = { id: "b1", title: "B1", maxPrint: 100 };
const sale = (n: number, extra: object = {}) => ({ num: `O${n}`, chan: "Website", qty: 1, price: 20, date: `2026-11-0${n}`, notes: "", sheetsId: `web-${n}`, ...extra });
// Stored the way the old app stores a book: every derived value already worked out by its recomputeAfters.
const withSales = (hist: object[]): BookState => {
  const state: BookState = { ...stitchState({ metadata: { stock: 100 - hist.length } }), hist: JSON.parse(JSON.stringify(hist)) };
  recomputeAfters(state, book);
  return state;
};
const addSale = (n: number) => (state: BookState) => { (state.hist as object[]).unshift(sale(n)); return state; };

function shop(hist: object[] = [sale(1)]) {
  const mem = new MemoryStockroom();
  mem.putCatalog([book, { id: "b2", title: "B2", maxPrint: 50 }]);
  mem.putBook("b1", withSales(hist));
  mem.putBook("b2", withSales([]));
  return mem;
}
/** Read a book back the way the old app's loaders do (`_fbLoad`: assembleParts, then stitchState). */
function readLikeOldApp(mem: MemoryStockroom, id: string) {
  const { parts } = assembleParts(mem.parts.get(id) ?? {});
  return stitchState(parts);
}

describe("saving a book", () => {
  it("stores each part as { data: JSON text } the old app reads back identically", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    const result = await writer.saveBookState("b1", addSale(2));
    expect(result.status).toBe("saved");
    const saved = result as BookSaved;
    // what the old app's own loaders see is exactly what the layer said it saved
    expect(readLikeOldApp(mem, "b1")).toEqual(saved.state);
    // the stored text per part is the plain JSON text the old app writes (JSON.stringify of the split part)
    const split = splitState(saved.state);
    for (const part of saved.written) expect(mem.parts.get("b1")?.[part]).toBe(JSON.stringify(split[part]));
    // ...and the admin's own reader sees the same book
    const records = await loadStockroom(mem.device());
    expect(records.states.b1).toEqual(saved.state);
    expect(catalogBooks(JSON.parse(mem.settings.get("catalog") as string)).length).toBe(2);
    expect(saved.state.stock).toBe(98);
    expect((saved.state.hist as unknown[]).length).toBe(2);
  });

  it("a record the old app wrote is changed without disturbing what it holds", async () => {
    const mem = shop([sale(1), sale(2)]);
    const before = readLikeOldApp(mem, "b1");
    const writer = createStockroomWriter(mem.device());
    await writer.saveBookState("b1", (s) => { (s.hist as Array<Record<string, unknown>>)[0].notes = "checked"; return s; });
    const after = readLikeOldApp(mem, "b1");
    expect((after.hist as Array<{ notes: string }>)[0].notes).toBe("checked");
    expect((after.hist as unknown[]).length).toBe(2);
    expect(after.stock).toBe(98);
    expect(before.hist).toHaveLength(2);
    // only the parts that changed were written
    expect(mem.log.at(-1)?.parts?.sort()).toEqual(["hist"]);
  });

  it("keeps both sales when two devices change the same book at once", async () => {
    const mem = shop();
    let injected = false;
    const racing = createStockroomWriter(mem.device({
      beforeCommit: () => {
        if (injected) return;
        injected = true;
        // synchronous stand-in for the other device finishing first: write its change straight into the records
        const split = splitState(readLikeOldApp(mem, "b1"));
        const hist = [sale(3), ...(split.hist as object[])];
        mem.parts.set("b1", { ...(mem.parts.get("b1") as Record<string, string>), hist: JSON.stringify(hist), metadata: JSON.stringify({ stock: 98 }) });
      },
    }));
    const result = await racing.saveBookState("b1", addSale(2));
    expect(result.status).toBe("saved");
    const saved = result as BookSaved;
    expect(saved.merged).toBe(true);
    expect(saved.conflicts).toEqual([]);
    const stored = readLikeOldApp(mem, "b1");
    expect((stored.hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
    expect(stored.stock).toBe(97);
    expect(describeResult(result).tone).toBe("ok");
  });

  it("two real saves one after the other each keep the other's rows", async () => {
    const mem = shop();
    const a = createStockroomWriter(mem.device());
    const b = createStockroomWriter(mem.device());
    await Promise.all([a.saveBookState("b1", addSale(2)), b.saveBookState("b1", addSale(3))]);
    const stored = readLikeOldApp(mem, "b1");
    expect((stored.hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
    expect(stored.stock).toBe(97);
  });

  it("says so when both devices changed the same sale, and keeps this device's version", async () => {
    const mem = shop();
    let injected = false;
    const writer = createStockroomWriter(mem.device({
      beforeCommit: () => {
        if (injected) return;
        injected = true;
        const hist = [sale(1, { notes: "theirs" })];
        mem.parts.set("b1", { ...(mem.parts.get("b1") as Record<string, string>), hist: JSON.stringify(hist) });
      },
    }));
    const result = await writer.saveBookState("b1", (s) => { (s.hist as Array<Record<string, unknown>>)[0].notes = "mine"; return s; });
    const saved = result as BookSaved;
    expect(saved.conflicts).toHaveLength(1);
    expect(describeResult(result).tone).toBe("warn");
    expect((readLikeOldApp(mem, "b1").hist as Array<{ notes: string }>)[0].notes).toBe("mine");
  });

  it("voiding a sale is stored as a voided row and the copy goes back on the shelf", async () => {
    const mem = shop([sale(1), sale(2)]);
    const writer = createStockroomWriter(mem.device());
    const result = await writer.saveBookState("b1", (s) => { (s.hist as Array<Record<string, unknown>>)[0].voided = true; return s; }) as BookSaved;
    expect(result.state.stock).toBe(99);
    expect((readLikeOldApp(mem, "b1").hist as Array<{ voided?: boolean }>).filter((r) => r.voided)).toHaveLength(1);
  });

  it("a failed write changes nothing, hands back a change to try again, and the retry lands", async () => {
    const mem = shop();
    const snapshot = JSON.stringify([...mem.parts.entries()]);
    const failing = createStockroomWriter(mem.device({ failCommit: new Error("write rejected") }));
    const result = await failing.saveBookState("b1", addSale(2));
    expect(result.status).toBe("failed");
    expect(JSON.stringify([...mem.parts.entries()])).toBe(snapshot);
    expect(mem.log).toEqual([]);
    if (result.status !== "failed" || !result.pending) throw new Error("expected a change to retry");
    // later, from a working connection (what an offline queue would do)
    const working = createStockroomWriter(mem.device());
    const again = await working.commitBookState(result.pending);
    expect(again.status).toBe("saved");
    expect((readLikeOldApp(mem, "b1").hist as unknown[]).length).toBe(2);
  });

  it("a retried change still merges with what another device saved meanwhile", async () => {
    const mem = shop();
    const failing = createStockroomWriter(mem.device({ failCommit: new Error("write rejected") }));
    const result = await failing.saveBookState("b1", addSale(2));
    if (result.status !== "failed" || !result.pending) throw new Error("expected a change to retry");
    await createStockroomWriter(mem.device()).saveBookState("b1", addSale(3));
    const again = await createStockroomWriter(mem.device()).commitBookState(result.pending);
    expect(again.status).toBe("saved");
    expect((readLikeOldApp(mem, "b1").hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
  });

  it("offline: nothing is read or written, and the change is never run", async () => {
    const mem = shop();
    const mutate = vi.fn((s: BookState) => s);
    const result = await createStockroomWriter(mem.device({ offline: true })).saveBookState("b1", mutate);
    expect(result).toMatchObject({ status: "failed", reason: "offline" });
    expect(mutate).not.toHaveBeenCalled();
    expect(mem.log).toEqual([]);
  });

  it("staff are refused in plain words and nothing is written", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device({ role: "staff" })).saveBookState("b1", addSale(2));
    expect(result).toMatchObject({ status: "refused", reason: "no-permission" });
    expect(describeResult(result)).toMatchObject({ tone: "error" });
    expect(describeResult(result).text).toMatch(/can't change/);
    expect(mem.log).toEqual([]);
  });

  it("refuses while the plan is paused", async () => {
    const mem = shop();
    mem.planDoc = { access: "paused" };
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", addSale(2));
    expect(result).toMatchObject({ status: "refused", reason: "plan-paused" });
    mem.planDoc = { access: "open" };
    expect((await createStockroomWriter(mem.device()).saveBookState("b1", addSale(2))).status).toBe("saved");
  });

  it("refuses an item the catalogue doesn't list", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveBookState("nope", (s) => s);
    expect(result).toMatchObject({ status: "refused", reason: "unknown-book" });
  });

  it("an error in the change itself reaches the caller and writes nothing", async () => {
    const mem = shop();
    await expect(createStockroomWriter(mem.device()).saveBookState("b1", () => { throw new Error("not enough copies"); })).rejects.toThrow("not enough copies");
    expect(mem.log).toEqual([]);
  });

  it("a change that leaves the book as it was writes nothing", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", (s) => s);
    expect(result.status).toBe("unchanged");
    expect(mem.log).toEqual([]);
  });

  it("refuses a book too big for one record, and writes nothing", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", (s) => { (s.hist as Array<Record<string, unknown>>)[0].notes = "x".repeat(1_100_000); return s; });
    expect(result).toMatchObject({ status: "failed", reason: "too-big" });
    expect(mem.log).toEqual([]);
  });

  it("does not treat a damaged stored part as empty", async () => {
    const mem = shop();
    mem.parts.set("b1", { ...(mem.parts.get("b1") as Record<string, string>), hist: "{broken" });
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", addSale(2));
    expect(result).toMatchObject({ status: "failed", reason: "unreadable" });
    expect(mem.parts.get("b1")?.hist).toBe("{broken");
  });

  it("an item flagged for the new store with only an older copy is copied across on its first save", async () => {
    const mem = shop();
    mem.parts.delete("b1");
    mem.oldBooks.set("b1", JSON.stringify(withSales([sale(1)])));
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", addSale(2));
    expect(result.status).toBe("saved");
    const stored = readLikeOldApp(mem, "b1");
    expect((stored.hist as unknown[]).length).toBe(2);
    expect(stored.stock).toBe(98);
  });
});

describe("a book still in the older store", () => {
  const oldShop = () => {
    const mem = new MemoryStockroom();
    mem.putCatalog([book]);
    mem.putBook("b1", withSales([sale(1)]), "old");
    return mem;
  };

  it("is saved there, as one { data } text, merging with another device's save", async () => {
    const mem = oldShop();
    let injected = false;
    const writer = createStockroomWriter(mem.device({
      beforeCommit: () => {
        if (injected) return;
        injected = true;
        mem.oldBooks.set("b1", JSON.stringify(withSales([sale(3), sale(1)])));
      },
    }));
    const result = await writer.saveBookState("b1", addSale(2)) as BookSaved;
    expect(result.status).toBe("saved");
    expect(result.merged).toBe(true);
    const stored = JSON.parse(mem.oldBooks.get("b1") as string);
    expect((stored.hist as Array<{ num: string }>).map((r) => r.num).sort()).toEqual(["O1", "O2", "O3"]);
    expect(stored.stock).toBe(97);
    expect(mem.parts.has("b1")).toBe(false); // the new store was not touched
  });

  it("is left alone when the new store also holds a copy", async () => {
    const mem = oldShop();
    mem.parts.set("b1", { hist: JSON.stringify([sale(9)]) });
    const result = await createStockroomWriter(mem.device()).saveBookState("b1", addSale(2));
    expect(result).toMatchObject({ status: "failed", reason: "two-copies" });
    expect(mem.log).toEqual([]);
  });

  it("is not saved from a page that read it before another device moved it to the new store", async () => {
    const mem = oldShop();
    const writer = createStockroomWriter(mem.device());
    const first = await writer.saveBookState("b1", addSale(2));
    expect(first.status).toBe("saved");
    // another device moves the book across
    mem.flags.fs_mode_b1 = true;
    mem.putBook("b1", withSales([sale(1), sale(2)]));
    const pending = { kind: "book" as const, bookId: "b1", store: "old" as const, base: {}, local: withSales([sale(5)]) };
    expect(await writer.commitBookState(pending)).toMatchObject({ status: "failed", reason: "moved" });
  });
});

describe("saving settings", () => {
  const taxCenter = (ids: number[]) => ({ settings: { baseCurrency: "CAD" }, businessExpenses: ids.map((id) => ({ id, date: "2026-11-01", amount: id })) });

  it("merges a catalogue change with one another device saved first", async () => {
    const mem = shop();
    let injected = false;
    const writer = createStockroomWriter(mem.device({
      beforeCommit: (kind) => {
        if (kind !== "setting" || injected) return;
        injected = true;
        const catalog = JSON.parse(mem.settings.get("catalog") as string);
        catalog.b3 = { id: "b3", title: "B3", maxPrint: 10 };
        mem.settings.set("catalog", JSON.stringify(catalog));
      },
    }));
    const result = await writer.updateSetting("catalog", (current) => {
      const next = current as Record<string, Record<string, unknown>>;
      next.b1 = { ...next.b1, title: "B1 renamed" };
      return next;
    });
    expect(result).toMatchObject({ status: "saved", merged: true });
    const stored = JSON.parse(mem.settings.get("catalog") as string);
    expect(Object.keys(stored).sort()).toEqual(["b1", "b2", "b3"]);
    expect(stored.b1.title).toBe("B1 renamed");
  });

  it("refuses the shared documents without the text they were read as", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveSetting("catalog", {});
    expect(result).toMatchObject({ status: "failed", reason: "needs-base" });
    expect(mem.log).toEqual([]);
  });

  it("stores a plain setting as { data } text, as the old app does", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveSetting("productionCosts", { b1: 4 });
    expect(result.status).toBe("saved");
    expect(mem.settings.get("productionCosts")).toBe(JSON.stringify({ b1: 4 }));
  });

  it("keeps the bookkeeper's copy of the Tax Centre in step", async () => {
    const mem = shop();
    mem.settings.set("taxCenter", JSON.stringify(taxCenter([1])));
    const result = await createStockroomWriter(mem.device()).updateSetting("taxCenter", () => taxCenter([1, 2]));
    expect(result.status).toBe("saved");
    const copy = JSON.parse(mem.settings.get("taxCentreForBookkeeper") as string);
    expect(copy.businessExpenses.map((e: { id: number }) => e.id)).toEqual([1, 2]);
  });

  it("does not save a Tax Centre that is still the device's startup copy", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).saveSetting("taxCenter", { ...taxCenter([1]), _preview: true }, { base: null });
    expect(result).toMatchObject({ status: "refused", reason: "preview-copy" });
    expect(mem.log).toEqual([]);
  });

  it("refuses staff and a paused plan for settings too", async () => {
    const mem = shop();
    expect(await createStockroomWriter(mem.device({ role: "staff" })).updateSetting("catalog", (c) => c)).toMatchObject({ status: "refused", reason: "no-permission" });
    mem.planDoc = { access: "closed" };
    expect(await createStockroomWriter(mem.device()).saveSetting("productionCosts", {})).toMatchObject({ status: "refused", reason: "plan-paused" });
    expect(mem.log).toEqual([]);
  });

  it("an unchanged setting writes nothing", async () => {
    const mem = shop();
    const result = await createStockroomWriter(mem.device()).updateSetting("catalog", (c) => c);
    expect(result.status).toBe("unchanged");
    expect(mem.log).toEqual([]);
  });
});

describe("the parts list", () => {
  it("is the stockroom's own: nine parts, metadata first", () => {
    expect(ALL_PARTS[0]).toBe("metadata");
    expect(ALL_PARTS).toHaveLength(9);
  });
});
