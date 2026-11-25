import { describe, expect, it } from "vitest";
import { FIRST_ORDER_WINDOW, firstOrderToCelebrate } from "./firstOrder";

const paid = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ id, paymentStatus: "paid", createdAt: at, ...extra });

describe("the first order on Home", () => {
  it("picks the earliest real paid order", () => {
    const orders = [paid("b", "2026-11-24T10:00:00Z"), paid("a", "2026-11-23T10:00:00Z")];
    expect(firstOrderToCelebrate(orders)?.id).toBe("a");
  });

  it("leaves out practice, sandbox, past and unpaid orders", () => {
    const orders = [
      paid("t", "2026-11-20T10:00:00Z", { isTest: true }),
      paid("s", "2026-11-20T10:00:00Z", { sandboxPayment: true }),
      paid("i", "2026-11-20T10:00:00Z", { source: "import" }),
      { id: "u", paymentStatus: "unpaid", createdAt: "2026-11-20T10:00:00Z" },
    ];
    expect(firstOrderToCelebrate(orders)).toBeNull();
    expect(firstOrderToCelebrate([...orders, paid("r", "2026-11-25T10:00:00Z")])?.id).toBe("r");
  });

  it("stays away once put away, while loading and for a shop well under way", () => {
    expect(firstOrderToCelebrate([paid("a", "2026-11-23T10:00:00Z")], "2026-11-24T00:00:00Z")).toBeNull();
    expect(firstOrderToCelebrate(null)).toBeNull();
    const many = Array.from({ length: FIRST_ORDER_WINDOW + 1 }, (_, i) => paid(`o${i}`, `2026-11-2${i}T10:00:00Z`));
    expect(firstOrderToCelebrate(many)).toBeNull();
  });
});
