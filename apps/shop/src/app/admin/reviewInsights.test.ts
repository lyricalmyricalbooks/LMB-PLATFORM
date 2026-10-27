import { describe, expect, it } from "vitest";
import { filterReviews, reviewStats } from "./reviewInsights";

const rs = [
  { id: "1", status: "approved", rating: 5, bookId: "b1", body: "Loved it", authorName: "Ann" },
  { id: "2", status: "approved", rating: 3, bookId: "b2", body: "ok", reply: { body: "Thanks" } },
  { id: "3", status: "pending", rating: 1, bookId: "b1", body: "bad" },
];
describe("reviewInsights", () => {
  it("computes stats", () => {
    const s = reviewStats(rs);
    expect(s).toMatchObject({ total: 3, average: 3, approvedAverage: 4, lowPending: 1, unanswered: 1 });
    expect(s.distribution).toEqual([1, 0, 1, 0, 1]);
  });
  it("filters by status, rating and text incl. book title", () => {
    const titles = { b1: "Night Sky", b2: "Other" };
    expect(filterReviews(rs, { status: "approved", rating: "all", q: "", titles })).toHaveLength(2);
    expect(filterReviews(rs, { status: "all", rating: "1", q: "", titles }).map((r) => r.id)).toEqual(["3"]);
    expect(filterReviews(rs, { status: "all", rating: "all", q: "night", titles }).map((r) => r.id)).toEqual(["1", "3"]);
  });
});

describe("verified purchases", () => {
  it("matches a reviewer to a paid order for that book (box-set parts too), ignoring test orders", async () => {
    const { purchaseIndex, isVerifiedPurchase } = await import("./reviewInsights");
    const index = purchaseIndex([
      { paymentStatus: "paid", customer: { email: "Ann@X.ca " }, items: [{ id: "b1" }, { id: "set", components: [{ id: "b2" }] }] },
      { paymentStatus: "unpaid", customer: { email: "bo@x.ca" }, items: [{ id: "b1" }] },
      { paymentStatus: "paid", isTest: true, customer: { email: "cy@x.ca" }, items: [{ id: "b1" }] },
    ]);
    expect(isVerifiedPurchase({ email: "ann@x.ca", bookId: "b1" }, index)).toBe(true);
    expect(isVerifiedPurchase({ email: "ann@x.ca", bookId: "b2" }, index)).toBe(true);
    expect(isVerifiedPurchase({ email: "ann@x.ca", bookId: "b3" }, index)).toBe(false);
    expect(isVerifiedPurchase({ email: "bo@x.ca", bookId: "b1" }, index)).toBe(false);
    expect(isVerifiedPurchase({ email: "cy@x.ca", bookId: "b1" }, index)).toBe(false);
    expect(isVerifiedPurchase({ bookId: "b1" }, index)).toBe(false);
  });
});

describe("featured reviews first", () => {
  it("puts pinned reviews on top and keeps the rest in order", async () => {
    const { featuredFirst } = await import("../features/site/ReviewsSection");
    expect(featuredFirst([{ id: "a" }, { id: "b", featured: true }, { id: "c" }] as any[]).map((r: any) => r.id)).toEqual(["b", "a", "c"]);
  });
});
