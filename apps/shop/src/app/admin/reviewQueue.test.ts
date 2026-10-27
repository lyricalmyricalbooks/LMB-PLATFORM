// Admin › Reviews must not read every pending review or one contact per review (#144).
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: any[] = [];
const doc = (id: string) => ({ id, data: () => ({ status: "pending" }) });
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (n: number) => ({ limit: n }),
  startAfter: (cursor: unknown) => ({ startAfter: cursor }),
  query: (...parts: unknown[]) => ({ parts }),
  getDocs: async (q: any) => {
    calls.push(q);
    const limitPart = q.parts.find((p: any) => "limit" in p);
    const pending = q.parts.some((p: any) => p.where?.[0] === "status");
    const count = limitPart ? limitPart.limit : 9999;
    return { docs: Array.from({ length: count }, (_, i) => doc(`${pending ? "p" : "r"}${i}`)) };
  },
  getCountFromServer: async () => ({ data: () => ({ count: 4321 }) }),
}));

import { BROWSE_LIMIT, loadMorePending, loadReviewQueue, PENDING_PAGE } from "./reviewQueue";

beforeEach(() => { calls.length = 0; });

describe("review moderation queue", () => {
  it("reads one limited page of pending reviews, never all of them", async () => {
    const page = await loadReviewQueue({} as any);
    const pendingQuery = calls.find(q => q.parts.some((p: any) => p.where?.[0] === "status"));
    expect(pendingQuery.parts.find((p: any) => "limit" in p).limit).toBe(PENDING_PAGE);
    expect(page.pending).toHaveLength(PENDING_PAGE);
    expect(page.recent).toHaveLength(BROWSE_LIMIT);
  });

  it("reports the true pending total from a server-side count", async () => {
    expect((await loadReviewQueue({} as any)).pendingTotal).toBe(4321);
  });

  it("offers a cursor for the next page and reads it on request", async () => {
    const page = await loadReviewQueue({} as any);
    expect(page.cursor?.id).toBe(`p${PENDING_PAGE - 1}`);
    calls.length = 0;
    const next = await loadMorePending({} as any, page.cursor!);
    expect(calls[0].parts.some((p: any) => p.startAfter?.id === page.cursor!.id)).toBe(true);
    expect(calls[0].parts.find((p: any) => "limit" in p).limit).toBe(PENDING_PAGE);
    expect(next.docs).toHaveLength(PENDING_PAGE);
  });

  it("does not read reviewer emails while loading", async () => {
    await loadReviewQueue({} as any);
    expect(calls.every(q => !JSON.stringify(q).includes("reviewContacts"))).toBe(true);
  });
});

describe("the Reviews screen", () => {
  it("fetches an email only when asked, one review at a time", async () => {
    const { readFileSync } = await import("node:fs");
    const screen = readFileSync(new URL("./ReviewsModeration.tsx", import.meta.url), "utf8");
    expect(screen).not.toMatch(/contactsFor\(list\)/);
    expect(screen).toMatch(/reviewsApi\.contactsFor\(\[r\]\)/);
    expect(screen).toMatch(/Show email/);
  });
});
