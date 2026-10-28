// Plan 5.6: URL redirects are saved in numbered pages of 500 (redirects/1 … redirects/10) and read back the same way
// by the shop and the admin; a shop saved before then (one settings/redirects doc) keeps working until its first save.
// Firestore is an in-memory map here; nothing reaches a real project.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { records, commits } = vi.hoisted(() => ({ records: new Map<string, any>(), commits: [] as { set: string[]; del: string[] }[] }));
vi.mock("firebase/firestore", () => {
  const snap = (path: string) => ({ id: path.split("/").pop(), exists: () => records.has(path), data: () => records.get(path) });
  return {
    collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/"), collection: true })),
    doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
    getDoc: vi.fn(async (ref: any) => snap(ref.path)),
    getDocs: vi.fn(async (ref: any) => ({
      docs: [...records.keys()].filter(p => p.startsWith(`${ref.path}/`) && p.split("/").length === ref.path.split("/").length + 1).map(snap),
    })),
    setDoc: vi.fn(async (ref: any, data: any) => { records.set(ref.path, structuredClone(data)); }),
    addDoc: vi.fn(async () => ({ id: "log" })),
    writeBatch: vi.fn(() => {
      const ops: (() => void)[] = [];
      const done = { set: [] as string[], del: [] as string[] };
      return {
        set: (ref: any, data: any) => { done.set.push(ref.path); ops.push(() => records.set(ref.path, structuredClone(data))); },
        delete: (ref: any) => { done.del.push(ref.path); ops.push(() => records.delete(ref.path)); },
        commit: async () => { ops.forEach(op => op()); commits.push(done); },
      };
    }),
    query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
    collectionGroup: vi.fn(), getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(() => "now"), Timestamp: class {},
    documentId: vi.fn(), onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: vi.fn(),
  };
});
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
import { publicApi } from "../lib/publicApi";
import { findRedirect, MAX_REDIRECTS } from "../features/site/redirects";
import { importRedirects } from "./shopMove";

const many = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ from: `/products/item-${start + i}`, to: `/books/b${start + i}` }));
const pageSizes = () => [...records.keys()].filter(p => p.startsWith("redirects/")).sort((a, b) => Number(a.split("/")[1]) - Number(b.split("/")[1]))
  .map(p => [p, records.get(p).items.length]);

beforeEach(() => { records.clear(); commits.length = 0; });

describe("redirects in numbered pages", () => {
  it.each([
    [499, [["redirects/1", 499]]],
    [500, [["redirects/1", 500]]],
    [501, [["redirects/1", 500], ["redirects/2", 1]]],
    [5000, Array.from({ length: 10 }, (_, i) => [`redirects/${i + 1}`, 500])],
  ])("%i redirects fill the pages in order and read back whole, in the same order", async (n, sizes) => {
    const list = many(n);
    const saved = await adminApi.saveRedirects(list);
    expect(saved).toEqual(list);
    expect(pageSizes()).toEqual(sizes);
    expect(records.get("redirects/1").items[0]).toEqual(list[0]);
    expect(records.get("settings/redirects")).toMatchObject({ items: [], paged: true, count: n });
    // The shop (publicApi) and the admin read the same list back.
    expect(await publicApi.getRedirects()).toEqual(list);
    expect(await adminApi.getRedirects()).toEqual(list);
    // One batch, every page written or cleared.
    expect(commits).toHaveLength(1);
    expect(commits[0].set.length + commits[0].del.length).toBe(11);
  });

  it("never keeps more than 5,000, and a shorter list clears the pages past its end", async () => {
    await adminApi.saveRedirects(many(MAX_REDIRECTS + 1));
    expect((await publicApi.getRedirects()).length).toBe(MAX_REDIRECTS);
    await adminApi.saveRedirects(many(501));
    expect(pageSizes()).toEqual([["redirects/1", 500], ["redirects/2", 1]]);
    await adminApi.saveRedirects([]);
    expect(pageSizes()).toEqual([]);
    expect(await publicApi.getRedirects()).toEqual([]);
  });

  it("a shop saved in the old single document keeps its redirects, and the first save moves them for good", async () => {
    records.set("settings/redirects", { items: many(3), updatedAt: "2026-10-01" });
    expect(await publicApi.getRedirects()).toEqual(many(3));
    await adminApi.saveRedirects([...(await adminApi.getRedirects()), ...many(1, 3)]);
    expect(pageSizes()).toEqual([["redirects/1", 4]]);
    expect(records.get("settings/redirects").items).toEqual([]);
    // Emptying the list afterwards never brings the old document's list back.
    await adminApi.saveRedirects([]);
    expect(await publicApi.getRedirects()).toEqual([]);
  });

  it("ignores a stray page outside 1–10 and reads pages by number, not by name order", async () => {
    records.set("redirects/10", { items: [{ from: "/ten", to: "/books/t" }] });
    records.set("redirects/2", { items: [{ from: "/two", to: "/books/w" }] });
    records.set("redirects/extra", { items: [{ from: "/stray", to: "/books/s" }] });
    expect((await publicApi.getRedirects()).map(r => r.from)).toEqual(["/two", "/ten"]);
  });

  it("the import fills the last free places, says plainly when the shop is full, and the book is still found after a rename", async () => {
    await adminApi.saveRedirects(many(MAX_REDIRECTS - 1));
    const next = importRedirects(await adminApi.getRedirects(), [{ oldPaths: ["/products/moth-songs", "/products/salt"], bookId: "b-moth" }]);
    expect(next.added).toEqual([{ from: "/products/moth-songs", to: "/books/b-moth" }]);
    expect(next.full).toBe(1);
    expect(next.skipped).toEqual([{ from: "/products/salt", why: "Your shop is full: it keeps up to 5,000 old links, so this one wasn't added." }]);
    await adminApi.saveRedirects(next.items);
    expect(pageSizes().at(-1)).toEqual(["redirects/10", 500]);
    // The old link leads to the book's id, which the book page finds whatever its title and address are now.
    expect(findRedirect(await publicApi.getRedirects(), "/Products/Moth-Songs/")).toBe("/books/b-moth");
  });
});
