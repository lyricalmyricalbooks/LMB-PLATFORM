// A free copy at the till takes no money, so it must never be recorded as income.
import { describe, expect, it } from "vitest";
import { FREE_COPY, addTillLine, newTillSale } from "./till";
import { withExtraSale } from "./tillExtras";

const cart = [{ id: "zine", title: "Zine", qty: 1, price: 20, cur: "CAD" }];
const record = (method: string) => {
  const sale = newTillSale(cart as any, method, "Spring fair", 1_800_000_000_000, () => 0.5);
  const state = addTillLine(sale, sale.lines[0], undefined)({ stock: 4, hist: [] } as any) as any;
  return { sale, state, row: state.hist[0] };
};

describe("a free copy at the till", () => {
  it("comes off the stock at no price, marked as given away", () => {
    const { state, row } = record(FREE_COPY);
    expect(state.stock).toBe(3);
    expect(row).toMatchObject({ qty: 1, price: 0, gratuity: true, notes: "Comp/Gift · Spring fair" });
    expect(row.payment).toMatchObject({ amount: 0, convertedTotal: 0 });
  });
  it("adds nothing to a till-only item's takings", () => {
    const { sale } = record(FREE_COPY);
    const catalog = { _posExtra: { zine: { title: "Zine", sold: 0, revenue: 0 } } };
    const next = withExtraSale("zine", sale.lines[0].rowId, sale.lines[0].qty, sale.lines[0].price)(catalog) as any;
    expect(next._posExtra.zine).toMatchObject({ sold: 1, revenue: 0 });
  });
  it("leaves a paid sale exactly as it was", () => {
    const { row } = record("Cash");
    expect(row.price).toBe(20);
    expect(row.payment.amount).toBe(20);
    expect(row).not.toHaveProperty("gratuity");
  });
});
