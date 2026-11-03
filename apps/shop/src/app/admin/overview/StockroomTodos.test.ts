import { describe, expect, it, vi } from "vitest";
vi.mock("../stockroomBridge", () => ({ stockroomBridge: { openPage: vi.fn(), askUntil: vi.fn() } }));
import { groupTodos, stockroomRunRows } from "./StockroomTodos";
import { stockroomBridge } from "../stockroomBridge";

const todo = (id: string, group: string, label = id) => ({ id, group, status: "warn", label, detail: "" });
const words = (t: string) => t.replace(/book/g, "product");

describe("stockroom to-dos on Home", () => {
  it("groups the to-dos in Home's order, with an extra line for kinds it doesn't know", () => {
    const groups = groupTodos([todo("s1", "stock"), todo("m1", "money"), todo("m2", "money"), todo("r1", "receipt")]);
    expect(groups.map((g) => [g.group, g.items.length])).toEqual([["orders", 0], ["money", 2], ["stock", 1], ["catalogue", 0], ["setup", 0], ["", 1]]);
  });

  it("counts every to-do, follows the shop's words and opens one item straight away", () => {
    const { rows, count } = stockroomRunRows({ items: [todo("c1", "catalogue", "Missing book cover"), todo("m1", "money"), todo("m2", "money")], loading: false, failed: false }, words);
    expect(count).toBe(3);
    const catalogue = rows.find((r) => r.key === "stockroom-catalogue")!;
    expect(catalogue.props).toMatchObject({ label: "product details to fill in", count: 1, detail: "Missing product cover" });
    catalogue.props.onOpen();
    expect(stockroomBridge.openPage).toHaveBeenLastCalledWith("todo", { todo: "c1" });
    const money = rows.find((r) => r.key === "stockroom-money")!;
    expect(money.props.detail).toBe("m1 and 1 more");
    money.props.onOpen();
    expect(stockroomBridge.openPage).toHaveBeenLastCalledWith("todo");
  });

  it("waits while the stockroom is asked, and never says all clear when it couldn't answer", () => {
    const waiting = stockroomRunRows({ items: null, loading: true, failed: false }, words);
    expect(waiting.count).toBeNull();
    expect(waiting.rows.every((r) => r.props.loading)).toBe(true);
    expect(stockroomRunRows({ items: null, loading: false, failed: true }, words)).toEqual({ rows: [], count: 0 });
  });
});
