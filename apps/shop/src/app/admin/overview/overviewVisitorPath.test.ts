import { describe, expect, it } from "vitest";
import { dropOffPath, lookedNotAdded } from "./overviewVisitorPath";

const day = (date: string, extra: Record<string, any>) => ({ date, ...extra });

describe("dropOffPath", () => {
  const cur = [
    day("2026-10-10", { visits: 600, funnel: { view: 300, add_to_cart: 60, checkout_start: 20, purchase: 8 }, checkout: { email: 18, address: 15, delivery: 14, pay: 10 } }),
    day("2026-10-11", { visits: 400, funnel: { view: 200, add_to_cart: 40, checkout_start: 20, purchase: 4 }, checkout: { email: 16, address: 14, delivery: 12, pay: 9 } }),
  ];
  const prev = [day("2026-10-01", { visits: 800, funnel: { view: 400, add_to_cart: 120, checkout_start: 30, purchase: 12 }, checkout: { email: 28, address: 25, delivery: 22, pay: 15 } })];

  it("lays out the whole path and names the biggest leak, matching the Funnel's rule", () => {
    const p = dropOffPath(cur, prev, { checkoutSince: "2026-09-01" })!;
    expect(p.steps.map(s => s.key)).toEqual(["visit", "view", "bag", "checkout", "email", "address", "delivery", "pay", "bought"]);
    expect(p.steps.map(s => s.count)).toEqual([1000, 500, 100, 40, 34, 29, 26, 19, 12]);
    // view→bag: 80% stop — the largest share.
    expect(p.steps[p.worst].key).toBe("bag");
    expect(p.headline).toBe("Most people stop between a book page and the bag");
    expect(p.steps[2].stopShare).toBeCloseTo(80);
    expect(p.steps[2].prevStopShare).toBeCloseTo(70);
    expect(p.steps[2].lost).toBe(400);
    expect(p.checkoutSince).toBeNull();
  });

  it("returns null when nothing was recorded in the period", () => {
    expect(dropOffPath([], prev, { checkoutSince: "2026-09-01" })).toBeNull();
    expect(dropOffPath([day("2026-10-10", { searches: { x: 1 } })])).toBeNull();
  });

  it("leaves the checkout steps out when they were never recorded (never zeros)", () => {
    const p = dropOffPath(cur, prev, { checkoutSince: null })!;
    expect(p.checkoutSteps).toBe(false);
    expect(p.steps.map(s => s.key)).toEqual(["visit", "view", "bag", "checkout", "bought"]);
  });

  it("says when checkout steps started mid-period and gives no 'was' for them", () => {
    const p = dropOffPath(cur, prev, { checkoutSince: "2026-10-11" })!;
    expect(p.checkoutSince).toBe("2026-10-11");
    expect(p.steps.find(s => s.key === "email")!.prevCount).toBeNull();
    expect(p.steps.find(s => s.key === "bag")!.prevCount).toBe(120);
  });

  it("never counts a negative leak when a step counted more than the one before", () => {
    const p = dropOffPath([day("2026-10-10", { visits: 10, funnel: { view: 25, add_to_cart: 5 } })], [], { checkoutSince: null })!;
    expect(p.steps[1].stopShare).toBe(0);
    expect(p.steps[1].lost).toBe(0);
    expect(p.steps[1].prevCount).toBeNull();
  });
});

describe("lookedNotAdded", () => {
  const books = [{ id: "a", title: "Salt Hymns" }, { id: "b", title: "Paper Moons" }, { id: "c", title: "Small Weather" }];
  const rows = [
    day("2026-10-10", { bookViews: { a: 40, b: 30, c: 3, gone: 9 }, bookAdds: { a: 1, b: 12, c: 1 } }),
    day("2026-10-11", { bookViews: { a: 10 }, bookAdds: {} }),
  ];

  it("ranks hardly-added books first, then by views that ended without a bag add, flags low add rates and keeps only books over the minimum", () => {
    const r = lookedNotAdded(rows, books, 5, { addsSince: "2026-01-01" })!;
    expect(r.rows.map(x => x.id)).toEqual(["a", "gone", "b"]);
    expect(r.rows[0]).toMatchObject({ title: "Salt Hymns", views: 50, adds: 1, low: true });
    expect(r.rows[0].addRate).toBeCloseTo(2);
    expect(r.rows[2].low).toBe(false);
    expect(r.rows[1].title).toBe("Removed book");
    expect(r.viewedBooks).toBe(4);
  });

  it("is null when bag adds were never recorded", () => {
    expect(lookedNotAdded(rows, books, 5, { addsSince: null })).toBeNull();
    expect(lookedNotAdded([day("2026-10-10", { visits: 4 })], books, 5, { addsSince: "2026-01-01" })).toBeNull();
  });

  it("counts views only from the day bag adds started, so the rate stays fair", () => {
    const r = lookedNotAdded(rows, books, 5, { addsSince: "2026-10-11" })!;
    expect(r.addsSince).toBe("2026-10-11");
    expect(r.rows).toEqual([expect.objectContaining({ id: "a", views: 10, adds: 0 })]);
  });

  it("honours a higher minimum", () => {
    expect(lookedNotAdded(rows, books, 35, { addsSince: "2026-01-01" })!.rows.map(x => x.id)).toEqual(["a"]);
  });
});
