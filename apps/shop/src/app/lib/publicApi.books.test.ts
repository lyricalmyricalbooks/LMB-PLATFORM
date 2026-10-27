// firestore.rules serve the public only books whose status is "published" (#18). Every shopper read of the
// catalog must say so, or the whole list is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: any[] = [];
let getDocError: any = null;
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  documentId: () => "__name__",
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (n: number) => ({ limit: n }),
  startAfter: (c: unknown) => ({ startAfter: c }),
  query: (...parts: unknown[]) => ({ parts }),
  getDocs: async (q: any) => { queries.push(q); return { docs: [{ id: "a", data: () => ({ title: "A", status: "published" }) }] }; },
  getDoc: async () => { if (getDocError) throw getDocError; return { exists: () => true, id: "a", data: () => ({ title: "A" }) }; },
  setDoc: vi.fn(), increment: vi.fn(),
}));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));

import { publicApi } from "./publicApi";

beforeEach(() => { queries.length = 0; getDocError = null; });

describe("shopper catalog reads", () => {
  it("lists only published books, ordered by document id", async () => {
    await publicApi.getStorefrontBooks(100);
    const parts = queries[0].parts;
    expect(parts[0]).toEqual({ collection: "books" });
    expect(parts).toContainEqual({ where: ["status", "==", "published"] });
    expect(parts).toContainEqual({ orderBy: ["__name__"] });
  });

  it("a book the rules refuse (draft, archived) reads as missing, not as an error", async () => {
    getDocError = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    expect(await publicApi.getBook("draft-book")).toBeNull();
  });

  it("other read errors still surface", async () => {
    getDocError = Object.assign(new Error("offline"), { code: "unavailable" });
    await expect(publicApi.getBook("a")).rejects.toThrow("offline");
  });
});
