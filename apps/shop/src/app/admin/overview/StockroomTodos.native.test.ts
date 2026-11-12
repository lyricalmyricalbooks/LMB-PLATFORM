import { describe, expect, it, vi } from "vitest";
vi.mock("../stockroomBridge", () => ({ stockroomBridge: { openPage: vi.fn(), askUntil: vi.fn() } }));
import { nativeTodoItems, stockroomGlance } from "./StockroomTodos";
import { buildTodo } from "../stockroom/todo";

const book = (id: string) => ({ id, title: `Title ${id}`, maxPrint: 100, threshold: 10 });
const sold = (qty: number) => ({ hist: [{ id: 1, qty, channel: "web", amount: 0 }] });
const records = { books: [book("low"), book("odd")], states: { low: sold(96) }, taxCenter: null, submissions: { odd: { sales: { s1: true } } } };
const w = (t: string) => t;

describe("Home's stockroom lines come from the same records as the To-do page", () => {
  it("counts the lines that need the owner, minus low-stock alerts Home lists itself", async () => {
    const items = await nativeTodoItems(w, true, async () => records);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("setup-submissions:odd");
    expect(ids).not.toContain("stock-low:low");
    // Everything Home shows is a line the To-do page shows too.
    const page = buildTodo(records).signals.map((s) => s.id);
    expect(ids.every((id) => page.includes(id))).toBe(true);
  });

  it("lets a failed read through, so the caller can tell it from an empty list", async () => {
    await expect(nativeTodoItems(w, true, async () => { throw new Error("network request failed"); })).rejects.toThrow("network");
  });
});

describe("Home's Both sides at a glance figures", () => {
  it("counts items low or out of stock by the Stock page's rule, and nothing owed with no stockists", () => {
    const glance = stockroomGlance(records as never);
    expect(glance.restock).toBe(1);
    expect(glance.owed).toEqual([]);
  });
});
