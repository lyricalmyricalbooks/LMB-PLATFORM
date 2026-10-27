import { afterEach, describe, expect, it, vi } from "vitest";
const getDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn(),
  doc: vi.fn(), getDoc: (...a: unknown[]) => getDoc(...a), documentId: vi.fn(),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
  onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn() }));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ appCheck: null, db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));
import { adminApi } from "./api";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => ({ status, ok: status < 300, json: async () => body, init })));

afterEach(() => vi.unstubAllGlobals());

describe("storefront order lookup", () => {
  it("asks the server with a private key and never reads Firestore directly", async () => {
    respond(200, { order: { id: "A", orderId: "A" } });
    expect(await adminApi.getPublicOrder("A", { email: "r@x.com" })).toMatchObject({ id: "A" });
    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ action: "track", orderId: "A", key: "" });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("returns null for an unknown order and a coded error for a wrong email", async () => {
    respond(404, { error: "not_found" });
    expect(await adminApi.getPublicOrder("Z", { email: "r@x.com" })).toBeNull();
    respond(403, { error: "email_mismatch" });
    await expect(adminApi.getPublicOrder("A", { email: "no@x.com" })).rejects.toMatchObject({ code: "email_mismatch" });
    respond(429, {});
    await expect(adminApi.getPublicOrder("A", { email: "r@x.com" })).rejects.toMatchObject({ code: "too_many" });
  });
});
