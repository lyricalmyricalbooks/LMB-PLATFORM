import { beforeEach, describe, expect, it, vi } from "vitest";
const { tx } = vi.hoisted(() => {
 const records = new Map<string, any>();
 const tx = { get: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path) })), update: vi.fn(), set: vi.fn() };
 return { tx, records };
});
const { taskAuth } = vi.hoisted(() => ({ taskAuth: { currentUser: null as any } }));
const setDoc = vi.fn(); const getDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), writeBatch: vi.fn(),
  setDoc: (...a: unknown[]) => (setDoc as any)(...a), getDoc: (...a: unknown[]) => (getDoc as any)(...a),
  getCountFromServer: vi.fn(), deleteField: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
  onSnapshot: vi.fn(), increment: vi.fn(), runTransaction: (_db: unknown, fn: any) => fn(tx),
}));
vi.mock("firebase/auth", () => ({
  signInWithPopup: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(), GoogleAuthProvider: class {}, signInWithCredential: vi.fn(), getAuth: vi.fn(),
}));
vi.mock("firebase/storage", () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), get: vi.fn() }));
vi.mock("../../lib/firebase", () => ({ db: {}, auth: taskAuth, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));


import { adminApi } from './api';
const config = { enabled: false, pickupLocations: [], deliveryZones: [] };
beforeEach(() => { setDoc.mockClear(); taskAuth.currentUser = null; });
describe('local fulfillment persistence authorization', () => {
 it('rejects anonymous, other accounts and unverified owner before writing', async () => {
  for (const user of [null, { email: 'other@example.com', emailVerified: true }, { email: 'lyricalmyricalbooks@gmail.com', emailVerified: false }]) {
   taskAuth.currentUser = user;
   await expect(adminApi.updateLocalFulfillment(config)).rejects.toThrow('Unauthorized');
  }
  expect(setDoc).not.toHaveBeenCalled();
 });
 it('saves only the local fulfillment field for the verified owner', async () => {
  taskAuth.currentUser = { email: 'lyricalmyricalbooks@gmail.com', emailVerified: true };
  await adminApi.updateLocalFulfillment(config);
  expect(setDoc).toHaveBeenCalledWith({ path: 'settings/website' }, { localFulfillment: config }, { mergeFields: ['localFulfillment'] });
 });
 it('rejects invalid enabled configuration before writing', async () => {
  taskAuth.currentUser = { email: 'lyricalmyricalbooks@gmail.com', emailVerified: true };
  await expect(adminApi.updateLocalFulfillment({ ...config, deliveryZones: [{ id: 'bad', enabled: true, name: 'Bad', price: -1, minimumSubtotal: 0, postalPrefixes: ['M6G'], postalCodes: [] }] })).rejects.toThrow('Fees');
  expect(setDoc).not.toHaveBeenCalled();
 });
 it('rejects a disabled pickup with a missing address before writing', async () => {
  taskAuth.currentUser = { email: 'lyricalmyricalbooks@gmail.com', emailVerified: true };
  await expect(adminApi.updateLocalFulfillment({ ...config, pickupLocations: [{ id: 'pickup', enabled: false, name: 'Pickup', price: 0, address: null }] })).rejects.toThrow('Pickup address');
  expect(setDoc).not.toHaveBeenCalled();
 });
});
