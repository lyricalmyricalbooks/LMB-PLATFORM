// Saving the book editor must write only what the owner changed: a field changed elsewhere while
// the editor was open (another tab, the catalog list, an import) keeps its live value.
import { beforeEach, describe, expect, it, vi } from "vitest";
const { tx, records, updateDoc } = vi.hoisted(() => {
 const records = new Map<string, any>();
 const tx = { get: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path) })), update: vi.fn(), set: vi.fn() };
 return { tx, records, updateDoc: vi.fn() };
});
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: (...a: unknown[]) => (updateDoc as any)(...a), deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  setDoc: vi.fn(), getDoc: vi.fn(), getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
  onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: (_db: unknown, fn: any) => fn(tx),
}));
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn(),
}));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

import { adminApi } from "./api";

beforeEach(() => { records.clear(); tx.update.mockClear(); updateDoc.mockClear(); });

describe("updateBook with the editor's loaded snapshot", () => {
  it("writes only the fields the owner changed, keeping fields changed elsewhere", async () => {
    const loaded = { title: "A", description: "old", retailPrice: 10, categories: ["Poetry"], stockLevel: 5, variants: [{ id: "p", price: 10, stock: 3 }] };
    records.set("books/b1", { title: "A", description: "edited in another tab", retailPrice: 12, categories: ["Poetry", "New"], stockLevel: 4, variants: [{ id: "p", price: 10, stock: 2 }] });
    const form = { ...JSON.parse(JSON.stringify(loaded)), title: "A, revised" };
    const saved = await adminApi.updateBook("b1", form, loaded);
    expect(tx.update).toHaveBeenCalledTimes(1);
    const written = tx.update.mock.calls[0][1];
    expect(Object.keys(written).sort()).toEqual(["title", "updatedAt"]);
    expect(written.title).toBe("A, revised");
    expect(saved).toMatchObject({ title: "A, revised", description: "edited in another tab", retailPrice: 12, stockLevel: 4 });
  });

  it("deep-compares nested edits and keeps live stock for untouched editions", async () => {
    const loaded = { variants: [{ id: "p", price: 10, stock: 3 }], stockLevel: 5 };
    records.set("books/b1", { variants: [{ id: "p", price: 10, stock: 1 }], stockLevel: 2 });
    const form = { variants: [{ id: "p", price: 11, stock: 3 }], stockLevel: 5 };
    await adminApi.updateBook("b1", form, loaded);
    const written = tx.update.mock.calls[0][1];
    // The book's own count is rebuilt from the live editions (1), not taken from the editor's stale total (5).
    expect(written.stockLevel).toBe(1);
    expect(written.variants[0]).toMatchObject({ price: 11, stock: 1, stockLevel: 1 });
  });

  it("still writes the whole form when no snapshot is given", async () => {
    await adminApi.updateBook("b1", { title: "T", stockLevel: 3 });
    expect(updateDoc).toHaveBeenCalledWith({ path: "books/b1" }, expect.objectContaining({ title: "T", stockLevel: 3 }));
  });
});
