import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Studio preview iframe renders the real storefront. Its clicks must not count as shopper funnel traffic.
const setDoc = vi.fn(async () => undefined);
const getDoc = vi.fn(async () => ({ exists: () => false, data: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  setDoc: (...a: unknown[]) => (setDoc as any)(...a), getDoc: (...a: unknown[]) => (getDoc as any)(...a),
  getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
  onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn(),
}));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ db: {}, appCheck: null, authState: { loaded: false } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

import { funnelApi } from "./commerce";

describe("funnel analytics in the editor preview", () => {
  beforeEach(() => { setDoc.mockClear(); getDoc.mockClear(); });
  afterEach(() => { delete (globalThis as any).window; });

  it("counts a real shopper event", async () => {
    (globalThis as any).window = { location: { search: "" } };
    await funnelApi.track("add_to_cart");
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("ignores events from the Studio preview iframe", async () => {
    (globalThis as any).window = { location: { search: "?preview=true" } };
    await funnelApi.track("add_to_cart");
    await funnelApi.trackCategory("Photography");
    expect(getDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
});
