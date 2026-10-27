import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { email: "lyricalmyricalbooks@gmail.com" } as any },
  live: [{ id: "a", name: "ZINES" }, { id: "b", name: "Books" }],
  records: {} as Record<string, any>, writes: [] as any[], reads: [] as string[],
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), setDoc: vi.fn(), getDoc: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getCountFromServer: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(), deleteField: vi.fn(),
  runTransaction: vi.fn(async (_db: unknown, fn: any) => fn({
    get: async (ref: any) => {
      if (mocks.writes.length) throw new Error("Read after write");
      mocks.reads.push(ref.path);
      const data = ref.path === "settings/website" ? { design: { categories: mocks.live } } : mocks.records[ref.path];
      return { ref, id: ref.path.split("/").at(-1), exists: () => !!data, data: () => data };
    },
    update: (ref: any, patch: any) => mocks.writes.push({ ref, patch }),
  })),
}));
vi.mock("firebase/auth", () => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: mocks.auth, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));
import { adminApi } from "./api";

describe("live category assignment writes", () => {
  beforeEach(() => {
    mocks.auth.currentUser = { email: "lyricalmyricalbooks@gmail.com" };
    mocks.writes.length = 0; mocks.reads.length = 0;
    mocks.records = { "books/one": { title: "One", categories: ["Art"], stock: 8 }, "books/two": { title: "Two", genres: ["ZINES", "Poetry"], price: 12 } };
  });
  it("anchors assignments to the published name even when the working design has a rename", async () => {
    await adminApi.updateCategoryBooks(["one"], { id: "a", name: "New zines", aliases: ["ZINES"] }, "add");
    expect(mocks.writes[0].patch.categories).toEqual(["Art", "ZINES"]);
    expect(Object.keys(mocks.writes[0].patch).sort()).toEqual(["categories", "genres", "updatedAt"]);
  });
  it("reads all fresh documents before writing and deduplicates selection", async () => {
    await adminApi.updateCategoryBooks(["two", "one", "two"], { id: "a", name: "ZINES" }, "move", { id: "b", name: "Draft books" });
    expect(mocks.reads).toEqual(["settings/website", "books/two", "books/one"]);
    expect(mocks.writes).toHaveLength(1);
    expect(mocks.writes[0].patch.categories).toEqual(["Books"]);
    expect(mocks.writes[0].patch.genres).toEqual(["Poetry"]);
  });
  it("refuses unpublished destinations and missing books without any writes", async () => {
    await expect(adminApi.updateCategoryBooks(["one"], { id: "new", name: "New" }, "add")).rejects.toThrow(/Publish/);
    await expect(adminApi.updateCategoryBooks(["one", "missing"], { id: "a", name: "ZINES" }, "add")).rejects.toThrow(/deleted/);
    expect(mocks.writes).toHaveLength(0);
  });
  it("rejects non-admin users and oversized saves before touching documents", async () => {
    mocks.auth.currentUser = null;
    await expect(adminApi.updateCategoryBooks(["one"], { id: "a", name: "ZINES" }, "add")).rejects.toThrow(/sign-in/);
    mocks.auth.currentUser = { email: "lyricalmyricalbooks@gmail.com" };
    await expect(adminApi.updateCategoryBooks(Array.from({ length: 401 }, (_, i) => `${i}`), { id: "a", name: "ZINES" }, "remove")).rejects.toThrow(/400/);
    expect(mocks.reads).toHaveLength(0);
  });
});
