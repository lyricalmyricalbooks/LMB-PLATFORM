// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fairNameOf, registerSalesForDay } from "@stockroom/fair-mode.js";

vi.mock("./stockroomWrite", () => ({
  stockroomWriteApi: { saveBookState: vi.fn() },
  describeResult: (r: { message?: string }) => ({ tone: "error", text: r.message || "Refused." }),
}));
import { stockroomWriteApi } from "./stockroomWrite";
import { Till } from "./TillPage";
import { addTillLine, cartLines, findItems, initials, leftFor, newTillSale, readQueue, tillItems, totalsOf, uploadLine, waitingCopies, writeQueue } from "./till";
import type { StockroomRecords } from "./stockroomData";

const records = (): StockroomRecords => ({
  books: [
    { id: "salt", title: "Salt Almanac", listPrice: 18, currency: "CAD", isbn: "978-1-23456-789-7" },
    { id: "tide", title: "Tidewrack", listPrice: 12, currency: "CAD" },
    { id: "zine", title: "The Ferry Poems", listPrice: 10, currency: "USD" },
  ],
  states: { salt: { stock: 38, hist: [] }, tide: { stock: 1, hist: [] }, zine: { hist: [] } },
  taxCenter: null,
});

describe("till rules", () => {
  it("makes tiles with initials, prices and copies on hand", () => {
    const items = tillItems(records());
    expect(items.map((i) => [i.initials, i.price, i.cur, i.onHand, i.tone])).toEqual([
      ["SA", 18, "CAD", 38, "mint"], ["T", 12, "CAD", 1, "apricot"], ["FP", 10, "USD", null, "sky"],
    ]);
    expect(initials("A")).toBe("A");
    expect(findItems(items, "9781234567897").map((i) => i.id)).toEqual(["salt"]);
    expect(findItems(items, "ferry").map((i) => i.id)).toEqual(["zine"]);
  });

  it("totals per currency and counts down copies left", () => {
    const items = tillItems(records());
    const cart = { salt: 1, tide: 2, zine: 1 };
    const lines = cartLines(cart, items);
    expect(totalsOf(lines)).toEqual([{ cur: "CAD", amount: 42 }, { cur: "USD", amount: 10 }]);
    const sale = newTillSale(lines.slice(0, 1), "Cash", "", 1_700_000_000_000);
    expect(leftFor(items[0], waitingCopies([sale]), { salt: 2 })).toBe(35);
    expect(leftFor(items[1], {}, cart)).toBe(-1);
    expect(leftFor(items[2], {}, cart)).toBeNull();
  });

  it("adds the stockroom register's row once, readable by its end-of-day rules", () => {
    const items = tillItems(records());
    const sale = newTillSale(cartLines({ tide: 2 }, items), "Card", "Harbour Fair", new Date(2026, 10, 11, 14).getTime());
    const state: Record<string, unknown> = { stock: 1, hist: [] };
    const mutate = addTillLine(sale, sale.lines[0], records().books[1]);
    mutate(state);
    mutate(state);
    const hist = state.hist as Array<Record<string, unknown>>;
    expect(hist).toHaveLength(1);
    expect(state.stock).toBe(0);
    expect(hist[0]).toMatchObject({ chan: "Book Fair", qty: 2, price: 12, notes: "Card · Harbour Fair", date: "2026-11-11", num: sale.num, enteredBy: "Publisher", cur: "CAD" });
    expect(fairNameOf(hist[0].notes)).toBe("Harbour Fair");
    const day = registerSalesForDay([{ id: "tide", title: "Tidewrack", currency: "CAD", hist }], "2026-11-11");
    expect(day.sales[0]).toMatchObject({ num: sale.num, method: "Card", units: 2, totals: { CAD: 24 } });
  });

  it("keeps the queue on the device and says what is waiting", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const sale = newTillSale(cartLines({ salt: 1 }, tillItems(records())), "Cash", "", 1);
    expect(writeQueue([sale], storage)).toBe(true);
    expect(readQueue(storage)).toEqual([sale]);
    writeQueue([], storage);
    expect(readQueue(storage)).toEqual([]);
    expect(uploadLine({ online: false, waiting: 2, kept: true }).text).toBe("Offline · 2 sales waiting to upload");
    expect(uploadLine({ online: true, waiting: 0, kept: true }).tone).toBe("ok");
    expect(uploadLine({ online: true, waiting: 1, kept: false }).tone).toBe("risk");
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const save = vi.mocked(stockroomWriteApi.saveBookState);
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent === text)!;

describe("the Till page", () => {
  beforeEach(() => { localStorage.clear(); save.mockReset(); document.body.innerHTML = ""; });

  async function mount(clock: { t: number }) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Till records={records()} now={() => clock.t} />); });
    return host;
  }

  it("rings up a sale, waits out the undo, then stores each line", async () => {
    const clock = { t: new Date(2026, 10, 11, 14).getTime() };
    save.mockImplementation(async (bookId, mutate) => ({ status: "saved", state: mutate({ stock: 38, hist: [] }), merged: false, conflicts: [], written: [] }) as never);
    const host = await mount(clock);
    await act(async () => { host.querySelector<HTMLButtonElement>("[aria-label^='Add Salt Almanac']")!.click(); });
    await act(async () => { host.querySelector<HTMLButtonElement>("[aria-label^='Add Salt Almanac']")!.click(); });
    expect(host.querySelector(".rp-till-total")!.textContent).toContain("$36.00");
    await act(async () => { button(host, "Cash").click(); });
    expect(host.querySelector(".rp-till-sold")!.textContent).toContain("Sold · $36.00 · Cash");
    expect(readQueue()).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
    clock.t += 9000;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe("salt");
    expect(readQueue()).toEqual([]);
    expect(host.querySelector(".rp-till-upload")!.textContent).toBe("All sales uploaded");
  });

  it("Undo takes the sale back before it is stored", async () => {
    const clock = { t: Date.now() };
    const host = await mount(clock);
    await act(async () => { host.querySelector<HTMLButtonElement>("[aria-label^='Add Tidewrack']")!.click(); });
    await act(async () => { button(host, "Card reader").click(); });
    await act(async () => { button(host, "Undo").click(); });
    expect(readQueue()).toEqual([]);
    expect(host.querySelector(".rp-till-lines")!.textContent).toContain("Tidewrack × 1");
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps a sale on the device while offline, and shows a refusal", async () => {
    const clock = { t: Date.now() };
    save.mockResolvedValueOnce({ status: "failed", reason: "offline", message: "Offline." } as never);
    const host = await mount(clock);
    await act(async () => { host.querySelector<HTMLButtonElement>("[aria-label^='Add Tidewrack']")!.click(); });
    await act(async () => { button(host, "Cash").click(); });
    clock.t += 9000;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(readQueue()).toHaveLength(1);
    expect(host.querySelector(".rp-till-upload")!.textContent).toContain("1 sale waiting");
    save.mockResolvedValueOnce({ status: "refused", reason: "no-permission", message: "Only the owner can record sales." } as never);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(host.querySelector(".rp-till-stuck")!.textContent).toContain("Only the owner can record sales.");
    expect(readQueue()[0].problem).toBe("Only the owner can record sales.");
  });
});
