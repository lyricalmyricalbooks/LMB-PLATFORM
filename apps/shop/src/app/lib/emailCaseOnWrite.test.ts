import { beforeEach, describe, expect, it, vi } from "vitest";

// Privacy export/erase match addresses exactly, so every browser write path stores them lower-cased.
const written: any[] = [];
const getDoc = vi.fn(async () => ({ exists: () => false, data: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  doc: vi.fn((c: any, ...path: string[]) => ({ name: c?.name, path: path.join("/"), id: path.at(-1) || "new" })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
  writeBatch: vi.fn(() => ({ set: (ref: any, data: any) => written.push({ ref: ref.name || ref.path, data }), commit: async () => {} })),
  setDoc: async (ref: any, data: any) => { written.push({ ref: ref.path, data }); },
  getDoc: (...a: unknown[]) => (getDoc as any)(...a),
  getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {}, documentId: vi.fn(),
  onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ db: {}, appCheck: null, authState: { loaded: false } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));

import { abandonedCartApi } from "./commerce";
import { reviewsApi } from "./reviews";
import { buildContactMessage } from "../features/site/contactMessages";

beforeEach(() => { written.length = 0; });

describe("emails are stored lower-cased", () => {
  it("contact form", () => {
    expect(buildContactMessage({ name: "J", email: " Jane@Example.com ", message: "hi" }).email).toBe("jane@example.com");
  });
  it("review contact", async () => {
    await reviewsApi.create({ bookId: "b", authorName: "J", rating: 5, body: "x", email: "Jane@Example.com" } as any);
    const contact = written.find(w => String(w.ref).startsWith("reviewContacts"));
    expect(contact?.data.email).toBe("jane@example.com");
  });
  it("abandoned cart (email and customer.email)", async () => {
    await abandonedCartApi.upsert("k1", { email: "Jane@Example.com", items: [], subtotal: 0, customer: { email: "Jane@Example.com", name: "J" } });
    const cart = written.find(w => w.ref === "abandoned-carts/k1");
    expect(cart.data.email).toBe("jane@example.com");
    expect(cart.data.customer.email).toBe("jane@example.com");
  });
});
