import { describe, expect, it } from "vitest";
import { comparedWith, leadStory } from "./overviewStory";
import { totals } from "./overviewInsights";

const money = (n: number) => `CA$${n.toFixed(2)}`;
const order = (total: number, quantity = 1) => ({ total, items: [{ id: "b1", title: "Salt", quantity, price: total }] });

describe("leadStory", () => {
  it("says how revenue moved against the period before", () => {
    const s = leadStory({ cur: totals([order(120, 2)]), prev: totals([order(100)]), days: 30, phrase: "the last 30 days", money,
      top: { id: "b1", title: "Salt", units: 2, revenue: 120, share: 100 } });
    expect(s.headline).toBe("CA$120.00 taken, up 20% on the 30 days before");
    expect(s.dek).toBe("1 paid order, 2 books sold. Salt led with 2 copies.");
  });

  it("handles falls, flat periods and no baseline", () => {
    expect(leadStory({ cur: totals([order(50)]), prev: totals([order(100)]), days: 7, phrase: "the last 7 days", money }).headline)
      .toBe("CA$50.00 taken, down 50% on the 7 days before");
    expect(leadStory({ cur: totals([order(100)]), prev: totals([order(100)]), days: 1, phrase: "today", money }).headline)
      .toBe("CA$100.00 taken, level with yesterday");
    expect(leadStory({ cur: totals([order(100)]), prev: totals([]), days: 365, phrase: "the last year", money }).headline)
      .toBe("CA$100.00 taken, with nothing to compare against before");
  });

  it("never invents sales when there are none", () => {
    const empty = leadStory({ cur: totals([]), prev: totals([]), days: 30, phrase: "the last 30 days", money });
    expect(empty.headline).toBe("No paid orders in the last 30 days");
    expect(empty.dek).toBe("Revenue shows here as soon as a customer pays.");
    const today = leadStory({ cur: totals([]), prev: totals([order(40)]), days: 1, phrase: "today", money });
    expect(today.headline).toBe("No paid orders yet today");
    expect(today.dek).toBe("Yesterday brought 1 paid order (CA$40.00).");
  });

  it("names the comparison window", () => {
    expect(comparedWith(90)).toBe("the 90 days before");
  });
});
