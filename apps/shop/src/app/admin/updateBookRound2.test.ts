// adminApi.updateBook, round 2: removed fields are deleted (#63) and a changed pre-order date reaches paid
// orders whichever screen saved, including the CSV import (#17).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, records, writes } = vi.hoisted(() => {
  const records = new Map<string, any>();
  const writes: { op: string; path: string; data: any; options?: any }[] = [];
  const tx = {
    get: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path) })),
    update: vi.fn((ref: any, data: any) => { writes.push({ op: "tx.update", path: ref.path, data }); }),
    set: vi.fn((ref: any, data: any, options?: any) => { writes.push({ op: "tx.set", path: ref.path, data, options }); }),
  };
  return { tx, records, writes };
});
const DELETE = { __delete: true };
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  collectionGroup: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  setDoc: vi.fn(), getDoc: vi.fn(), getCountFromServer: vi.fn(), deleteField: vi.fn(() => DELETE), serverTimestamp: vi.fn(), Timestamp: class {},
  documentId: vi.fn(), onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: (_db: unknown, fn: any) => fn(tx),
}));
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn(),
}));
vi.mock("firebase/app", () => ({ getApp: vi.fn(() => ({})) }));
vi.mock("firebase/storage", () => ({ getStorage: vi.fn(() => ({})), ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

import { adminApi } from "./api";

beforeEach(() => { records.clear(); writes.length = 0; vi.restoreAllMocks(); vi.spyOn(adminApi, "recordAuditLog").mockResolvedValue(undefined as any); });

describe("updateBook round 2", () => {
  it("#63 deletes a field the owner removed (gift card switched back to a book)", async () => {
    records.set("books/b1", { title: "Card", productType: "giftCard", status: "published" });
    const loaded = { title: "Card", productType: "giftCard", status: "published" };
    await adminApi.updateBook("b1", { title: "Card", status: "published", retailPrice: 12 }, loaded, { removeMissing: true });
    const written = writes.find(w => w.op === "tx.update" && w.path === "books/b1")!.data;
    expect(written.productType).toBe(DELETE);
    expect(written.retailPrice).toBe(12);
  });

  it("#63 a partial write (bulk edit, CSV import) never deletes the fields it does not mention", async () => {
    records.set("books/b1", { title: "A", productType: "giftCard", description: "keep" });
    await adminApi.updateBook("b1", { title: "A", retailPrice: 3 }, { title: "A", productType: "giftCard", description: "keep" });
    const written = writes.find(w => w.op === "tx.update" && w.path === "books/b1")!.data;
    expect(Object.values(written)).not.toContain(DELETE);
  });

  it("#63 removes a cleared private field from the private document too", async () => {
    records.set("books/b1", { title: "A" });
    records.set("books/b1/private/admin", { costPrice: 5 });
    await adminApi.updateBook("b1", { title: "A" }, { title: "A", costPrice: 5 }, { removeMissing: true });
    const priv = writes.find(w => w.op === "tx.set" && w.path === "books/b1/private/admin")!;
    expect(priv.data.costPrice).toBe(DELETE);
    expect(priv.options.mergeFields).toContain("costPrice");
  });

  it("#17 a CSV-import style save that moves the publication date re-stamps paid pre-orders", async () => {
    records.set("books/b1", { title: "Pre", preorder: true, publishDate: "2026-11-01", status: "published" });
    const sync = vi.spyOn(adminApi, "syncPreorderOrders").mockResolvedValue(2);
    const loaded = { id: "b1", title: "Pre", preorder: true, publishDate: "2026-11-01", status: "published" };
    const saved: any = await adminApi.updateBook("b1", { title: "Pre", publishDate: "2026-12-01" }, loaded);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][0]).toBe("b1");
    expect(sync.mock.calls[0][1]).toMatchObject({ preorder: true, publishDate: "2026-12-01" });
    expect(saved.preorderSync).toEqual({ updated: 2, failed: false });
  });

  it("#17 does not scan orders when the pre-order fields did not change", async () => {
    records.set("books/b1", { title: "Pre", preorder: true, publishDate: "2026-11-01" });
    const sync = vi.spyOn(adminApi, "syncPreorderOrders").mockResolvedValue(0);
    await adminApi.updateBook("b1", { title: "Pre 2" }, { title: "Pre", preorder: true, publishDate: "2026-11-01" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("#17 reports (not throws) a failed order update so the book save still stands", async () => {
    records.set("books/b1", { title: "Pre", preorder: false });
    vi.spyOn(adminApi, "syncPreorderOrders").mockRejectedValue(new Error("offline"));
    const saved: any = await adminApi.updateBook("b1", { title: "Pre", preorder: true }, { title: "Pre", preorder: false });
    expect(saved.preorderSync).toEqual({ updated: 0, failed: true });
  });

  it("#46 writes the tracked flag a legacy book never had", async () => {
    records.set("books/b1", { title: "Legacy", stockLevel: 4 });
    await adminApi.updateBook("b1", { title: "Legacy 2", trackInventory: true, status: "draft" }, { title: "Legacy", trackInventory: true, status: "draft" });
    const written = writes.find(w => w.op === "tx.update" && w.path === "books/b1")!.data;
    expect(written).toMatchObject({ title: "Legacy 2", trackInventory: true, status: "draft" });
  });

  it("#65 stores the edition total from the live editions", async () => {
    records.set("books/b1", { title: "E", stockLevel: 7, variants: [{ id: "pb", stock: 4 }, { id: "hc", stock: 3 }] });
    const loaded = { title: "E", stockLevel: 8, variants: [{ id: "pb", stock: 5 }, { id: "hc", stock: 3 }] };
    await adminApi.updateBook("b1", { title: "E", stockLevel: 9, variants: [{ id: "pb", stock: 5 }, { id: "hc", stock: 4 }] }, loaded);
    const written = writes.find(w => w.op === "tx.update" && w.path === "books/b1")!.data;
    expect(written.stockLevel).toBe(8);
  });
});
