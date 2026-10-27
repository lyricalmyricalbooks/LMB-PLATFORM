// The admin API keeps cost prices and other private fields in books/{id}/private/admin (#18) and uploads digital
// files without asking Storage for a download URL it would refuse (#4).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, records, writes, getDocs, getDownloadURL, uploadBytes } = vi.hoisted(() => {
  const records = new Map<string, any>();
  const writes: { op: string; path: string; data: any; options?: any }[] = [];
  const tx = {
    get: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path) })),
    update: vi.fn((ref: any, data: any) => { writes.push({ op: "tx.update", path: ref.path, data }); }),
    set: vi.fn((ref: any, data: any, options?: any) => { writes.push({ op: "tx.set", path: ref.path, data, options }); }),
  };
  return { tx, records, writes, getDocs: vi.fn(), getDownloadURL: vi.fn(async () => "https://download"), uploadBytes: vi.fn(async (ref: any) => ({ ref: { fullPath: ref.path } })) };
});
const DELETE = { __delete: true };
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ group: id })),
  getDocs: (...a: unknown[]) => (getDocs as any)(...a),
  addDoc: vi.fn(async (_ref: any, data: any) => { writes.push({ op: "addDoc", path: "books", data }); return { id: "new1" }; }),
  updateDoc: vi.fn(async (ref: any, data: any) => { writes.push({ op: "updateDoc", path: ref.path, data }); }),
  deleteDoc: vi.fn(async (ref: any) => { writes.push({ op: "deleteDoc", path: ref.path, data: null }); }),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  setDoc: vi.fn(async (ref: any, data: any, options?: any) => { writes.push({ op: "setDoc", path: ref.path, data, options }); }),
  getDoc: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path), id: ref.path.split("/")[1] })),
  getCountFromServer: vi.fn(), deleteField: vi.fn(() => DELETE), serverTimestamp: vi.fn(), Timestamp: class {},
  documentId: vi.fn(), onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: (_db: unknown, fn: any) => fn(tx),
}));
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn(),
}));
vi.mock("firebase/app", () => ({ getApp: vi.fn(() => ({})) }));
vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  uploadBytes: (...a: unknown[]) => (uploadBytes as any)(...a),
  getDownloadURL: (...a: unknown[]) => (getDownloadURL as any)(...a),
}));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

import { adminApi } from "./api";

beforeEach(() => { records.clear(); writes.length = 0; tx.update.mockClear(); tx.set.mockClear(); getDocs.mockReset(); getDownloadURL.mockClear(); uploadBytes.mockClear(); });


describe("private book fields", () => {
  it("createBook keeps the cost price off the public document", async () => {
    await adminApi.createBook({ title: "A", retailPrice: 20, costPrice: 6.5, usdCostPrice: 4.7, shelfLocation: "B2", variants: [{ id: "p", price: 20, shelfLocation: "C1" }] });
    const created = writes.find(w => w.op === "addDoc")!.data;
    expect(created).not.toHaveProperty("costPrice");
    expect(created).not.toHaveProperty("usdCostPrice");
    expect(created).not.toHaveProperty("shelfLocation");
    expect(created.variants[0]).not.toHaveProperty("shelfLocation");
    const priv = writes.find(w => w.path === "books/new1/private/admin")!;
    expect(priv.data).toMatchObject({ costPrice: 6.5, usdCostPrice: 4.7, shelfLocation: "B2", variantShelf: { p: "C1" } });
  });

  it("updateBook writes a changed cost to the private document and scrubs the public copy", async () => {
    const loaded = { title: "A", costPrice: 5, retailPrice: 10 };
    records.set("books/b1", { title: "A", retailPrice: 10, costPrice: 5 }); // still public: not migrated yet
    const saved = await adminApi.updateBook("b1", { ...loaded, costPrice: 8 }, loaded);
    const publicUpdate = tx.update.mock.calls[0][1];
    expect(publicUpdate).toMatchObject({ costPrice: DELETE });
    const privateWrite = writes.find(w => w.op === "tx.set" && w.path === "books/b1/private/admin")!;
    expect(privateWrite.data).toMatchObject({ costPrice: 8 });
    expect(privateWrite.options.mergeFields).toContain("costPrice");
    expect(saved.costPrice).toBe(8);
  });

  it("updateBook compares against the merged private value, so an unchanged cost is not rewritten", async () => {
    records.set("books/b1", { title: "A" });
    records.set("books/b1/private/admin", { costPrice: 5 });
    const loaded = { title: "A", costPrice: 5 };
    await adminApi.updateBook("b1", { ...loaded, title: "B" }, loaded);
    expect(writes.some(w => w.path === "books/b1/private/admin")).toBe(false);
    expect(Object.keys(tx.update.mock.calls[0][1]).sort()).toEqual(["title", "updatedAt"]);
  });

  it("getAllBooks merges each book's private document (collection group read) and tolerates both locations", async () => {
    getDocs.mockImplementation(async (q: any) => q.group === "private"
      ? { docs: [{ id: "admin", data: () => ({ costPrice: 7 }), ref: { parent: { parent: { id: "a" } } } }] }
      : { docs: [{ id: "a", data: () => ({ title: "A" }) }, { id: "b", data: () => ({ title: "B", costPrice: 3 }) }] });
    const books = await adminApi.getAllBooks();
    expect(books.find((b: any) => b.id === "a").costPrice).toBe(7);
    expect(books.find((b: any) => b.id === "b").costPrice).toBe(3); // legacy public value still readable
  });

  it("getAllBooks still lists books when the private documents cannot be read yet (rules not deployed)", async () => {
    getDocs.mockImplementation(async (q: any) => {
      if (q.group === "private") throw Object.assign(new Error("denied"), { code: "permission-denied" });
      return { docs: [{ id: "a", data: () => ({ title: "A" }) }] };
    });
    expect(await adminApi.getAllBooks()).toEqual([{ id: "a", title: "A" }]);
  });

  it("deleting a book also deletes its private document", async () => {
    records.set("books/b1", { title: "A" });
    await adminApi.deleteBook("b1");
    expect(writes.filter(w => w.op === "deleteDoc").map(w => w.path)).toEqual(["books/b1", "books/b1/private/admin"]);
  });
});

describe("digital file upload (#4)", () => {
  it("returns the Storage path and never asks for a download URL on a read-denied folder", async () => {
    const file = new File(["x"], "book.epub");
    const path = await adminApi.uploadStoragePath(file, "digital-assets/1-book.epub");
    expect(path).toBe("digital-assets/1-book.epub");
    expect(getDownloadURL).not.toHaveBeenCalled();
  });

  it("the book editor uses it for digital-assets and stores the path, not a URL", async () => {
    const { readFileSync } = await import("node:fs");
    const editor = readFileSync(new URL("./BookEditor.tsx", import.meta.url), "utf8");
    expect(editor).not.toMatch(/uploadFile\(file, `digital-assets/);
    expect(editor).toMatch(/uploadStoragePath\(file, `digital-assets\/\$\{fileName\}`\)/);
    // downloadDigitalAsset opens digital-assets/<digitalFileName>, so the name must still be saved.
    expect(editor).toMatch(/digitalFileName: fileName/);
  });
});
