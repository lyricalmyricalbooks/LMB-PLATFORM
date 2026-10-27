import { describe, expect, it } from "vitest";
import { array, boolean, check, nullable, number, object, oneOf, optional, string, type Infer } from "./edge";
import { orderActionBody, refundOrderBody } from "./orderActions";

describe("edge schemas", () => {
  const schema = object({ id: string({ min: 1 }), n: optional(number({ int: true, min: 0 })), on: optional(boolean()), kind: optional(oneOf(["a", "b"] as const)), rows: optional(nullable(array(object({ i: number() }), { max: 2 }))) });
  it("returns only the listed keys and names the first wrong one", () => {
    expect(check(schema, { id: "x", n: 2, extra: true })).toEqual({ ok: true, value: { id: "x", n: 2 } });
    const bad = check(schema, { id: "x", rows: [{ i: 1 }, { i: "2" }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.path).toBe("rows[1].i");
    for (const value of [null, [], "x", { id: "" }, { id: "x", n: -1 }, { id: "x", n: 1.5 }, { id: "x", kind: "c" }, { id: "x", rows: [{ i: 1 }, { i: 2 }, { i: 3 }] }, { id: "x", n: NaN }]) {
      expect(check(schema, value).ok, JSON.stringify(value)).toBe(false);
    }
    expect(check(schema, { id: "x", rows: null }).ok).toBe(true);
  });
  it("gives the parsed value its type", () => {
    type T = Infer<typeof schema>;
    const t: T = { id: "x" };
    expect(t.id).toBe("x");
  });
});

describe("order action bodies", () => {
  it("accept what the admin sends and refuse paths", () => {
    expect(check(orderActionBody, { action: "cancelOrder", orderId: "A1" })).toEqual({ ok: true, value: { orderId: "A1" } });
    expect(check(orderActionBody, { orderId: "orders/A1" }).ok).toBe(false);
    expect(check(orderActionBody, {}).ok).toBe(false);
    expect(check(refundOrderBody, { orderId: "A", reason: "Admin refund", restock: true, amountMinor: 500, restockLines: [{ index: 0, quantity: 1 }] }).ok).toBe(true);
    expect(check(refundOrderBody, { orderId: "A", amountMinor: "500" }).ok).toBe(false);
  });
});
