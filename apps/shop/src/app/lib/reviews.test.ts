import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: any[] = [];
const bookLists: Record<string, any[]> = {};
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db: any, name: string) => ({ name }),
  doc: (_db: any, name: string, id?: string) => ({ name, id: id || "new" }),
  documentId: () => "__id__",
  where: (...args: any[]) => ({ where: args }),
  query: (col: any, ...parts: any[]) => ({ col, parts }),
  orderBy: () => ({}), limit: () => ({}), startAfter: () => ({}), count: () => ({ kind: "count" }), average: (field: string) => ({ kind: "average", field }),
  getAggregate: async (q: any, spec: any) => { calls.push({ aggregate: q, spec }); return { data: () => ({ count: 137, average: 4.25 }) }; },
  updateDoc: async () => {}, deleteField: () => ({}), getDoc: async () => ({ exists: () => false }),
  getDocs: async (q: any) => {
    calls.push(q);
    if (q.name === "reviews") return { docs: [] };
    // Approved-list reads for a book answer from `bookLists` (a full page by default, so totals use the aggregate).
    const bookId = q.parts?.find((p: any) => p?.where?.[0] === "bookId")?.where[2];
    if (q.col?.name === "reviews" && bookId) {
      const list = bookLists[bookId] ?? Array.from({ length: 50 }, () => ({ rating: 4 }));
      return { docs: list.map((r, i) => ({ id: `${bookId}-${i}`, data: () => r })) };
    }
    // The one-time legacy email move asks only for reviews that still hold a public email.
    if (q.col?.name === "reviews") return { docs: [] };
    const ids: string[] = q.parts[0].where[2];
    return { docs: ids.filter(id => id !== "r2").map(id => ({ id, data: () => ({ email: `${id}@x.ca` }) })) };
  },
  writeBatch: () => {
    const ops: any[] = [];
    return { delete: (ref: any) => ops.push(["delete", ref.name, ref.id]), set: () => {}, update: () => {}, commit: async () => { calls.push(ops); } };
  },
}));

import { chunk, reviewsApi } from "./reviews";

beforeEach(() => { calls.length = 0; });

describe("reviews admin api", () => {
  it("chunks ids by 30", () => {
    expect(chunk(Array.from({ length: 65 }, (_, i) => i), 30).map(c => c.length)).toEqual([30, 30, 5]);
  });
  it("deletes the review and its private contact in one batch", async () => {
    await reviewsApi.remove("r1");
    expect(calls.at(-1)).toEqual([["delete", "reviews", "r1"], ["delete", "reviewContacts", "r1"]]);
  });
  it("reads contacts with one query per 30 reviews", async () => {
    const reviews: any[] = Array.from({ length: 31 }, (_, i) => ({ id: `r${i}` }));
    const out = await reviewsApi.contactsFor(reviews);
    const contactQueries = calls.filter(c => c?.col?.name === "reviewContacts");
    expect(contactQueries).toHaveLength(2);
    expect(out.r1).toBe("r1@x.ca");
    expect(out.r2).toBeUndefined();
  });
});

describe("approved review totals (#146)", () => {
  it("counts every approved review with Firestore's own count and average, not the newest page", async () => {
    const total = await reviewsApi.summary("book-146");
    expect(total).toEqual({ count: 137, average: 4.25 });
    const aggregate = calls.find(c => c?.aggregate);
    expect(aggregate.spec).toEqual({ count: { kind: "count" }, average: { kind: "average", field: "rating" } });
    // Restricted to this book's approved reviews.
    expect(aggregate.aggregate.parts.map((p: any) => p.where)).toEqual([["bookId", "==", "book-146"], ["status", "==", "approved"]]);
  });
  it("shares one read per book for a short while", async () => {
    await reviewsApi.summary("book-shared");
    await reviewsApi.summary("book-shared");
    expect(calls.filter(c => c?.aggregate)).toHaveLength(1);
  });
  it("counts a short list itself: it already holds every approved review, so no aggregation query", async () => {
    bookLists["book-few"] = [{ rating: 5 }, { rating: 4 }, { rating: 4 }];
    const [list, total] = await Promise.all([reviewsApi.listApproved("book-few"), reviewsApi.summary("book-few")]);
    expect(list).toHaveLength(3);
    expect(total).toEqual({ count: 3, average: 13 / 3 });
    expect(calls.filter(c => c?.aggregate)).toHaveLength(0);
    // The list was read once and shared.
    expect(calls.filter(c => c?.col?.name === "reviews")).toHaveLength(1);
  });
  it("no approved reviews: count 0, average 0, no aggregation query", async () => {
    bookLists["book-none"] = [];
    expect(await reviewsApi.summary("book-none")).toEqual({ count: 0, average: 0 });
    expect(calls.filter(c => c?.aggregate)).toHaveLength(0);
  });
  it("a full page may be cut off, so Firestore counts", async () => {
    bookLists["book-full"] = Array.from({ length: 50 }, () => ({ rating: 1 }));
    expect(await reviewsApi.summary("book-full")).toEqual({ count: 137, average: 4.25 });
    expect(calls.filter(c => c?.aggregate)).toHaveLength(1);
  });
});

describe("summaryFromCompleteList", () => {
  it("averages numeric ratings like Firestore's average, and refuses a full page", async () => {
    const { summaryFromCompleteList, REVIEW_PAGE } = await import("./reviews");
    expect(summaryFromCompleteList([{ rating: 5 }, { rating: "x" as any }, { rating: 3 }])).toEqual({ count: 3, average: 4 });
    expect(summaryFromCompleteList([{ rating: undefined as any }])).toEqual({ count: 1, average: 0 });
    expect(summaryFromCompleteList(Array.from({ length: REVIEW_PAGE }, () => ({ rating: 5 })))).toBeNull();
    expect(summaryFromCompleteList(null)).toBeNull();
  });
});

describe("the Studio preview never saves a review (#145)", () => {
  it("returns without writing when the page is the preview", async () => {
    (globalThis as any).window = { location: { search: "?preview=true" } };
    try {
      const saved = await reviewsApi.create({ bookId: "b", authorName: "A", rating: 5, body: "Nice" } as any);
      expect(saved.id).toBe("preview");
      expect(calls.some(c => Array.isArray(c))).toBe(false); // no batch committed
    } finally { delete (globalThis as any).window; }
  });
});
