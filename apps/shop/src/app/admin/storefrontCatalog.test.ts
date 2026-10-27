import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn((...args) => args), getDocs: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("firebase/firestore", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  collection: (_db: unknown, name: string) => name,
  documentId: () => "__name__",
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (count: number) => ({ limit: count }),
  startAfter: (cursor: unknown) => ({ startAfter: cursor }),
  query: mocks.query,
  getDocs: mocks.getDocs,
}));
import { adminApi } from "./api";

describe("public catalog membership", () => {
  it("paginates published books by document ID without excluding legacy books missing createdAt", async () => {
    const legacy = { id: "legacy", data: () => ({ title: "Legacy book", status: "published" }) };
    mocks.getDocs.mockResolvedValue({ docs: [legacy] });
    const result = await adminApi.getStorefrontBooks(100);
    expect(mocks.query).toHaveBeenLastCalledWith("books", { where: ["status", "==", "published"] }, { orderBy: "__name__" }, { limit: 100 });
    expect(result).toEqual([{ title: "Legacy book", status: "published", id: "legacy", _lastDoc: legacy }]);
    await adminApi.getStorefrontBooks(100, legacy as never);
    expect(mocks.query).toHaveBeenLastCalledWith("books", { where: ["status", "==", "published"] }, { orderBy: "__name__" }, { startAfter: legacy }, { limit: 100 });
  });
});
