import { beforeEach, describe, expect, it, vi } from "vitest";
const { tx, records } = vi.hoisted(() => {
 const records = new Map<string, any>();
 const tx = { get: vi.fn(async (ref: any) => ({ exists: () => records.has(ref.path), data: () => records.get(ref.path) })), update: vi.fn(), set: vi.fn() };
 return { tx, records };
});
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
vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("firebase/firestore/lite", () => import("firebase/firestore"));
vi.mock("../../lib/legacyFirebase", () => ({ legacyDb: {}, legacyAuth: {} }));


import { adminApi } from "./api";
import { addressKey, packingKey } from "./fulfillment";
const base = () => ({ paymentStatus: "paid", status: "open", customer: { address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M6G3H1", country: "Canada" } }, items: [{ id: "b", quantity: 1 }] });
beforeEach(() => { records.clear(); tx.update.mockClear(); tx.set.mockClear(); const o = base(); records.set("orders/a", o); records.set("order-operations/a", { addressReviewed: addressKey(o), packed: packingKey(o), activity: [] }); });
describe("atomic fulfillment actions", () => {
 it("dispatches with tracking and private history, without writing payment or inventory", async () => { await adminApi.fulfillmentAction("a", "dispatch", { trackingCarrier: "Canada Post", trackingNumber: "123" }); expect(tx.update).toHaveBeenCalledWith({ path: "orders/a" }, expect.objectContaining({ fulfillmentStatus: "shipped", trackingNumber: "123" })); expect(tx.update.mock.calls[0][1]).not.toHaveProperty("paymentStatus"); expect(tx.set.mock.calls[0][0].path).toBe("order-operations/a"); });
 it("stores a manual carrier name and tracking link, and rejects unsafe links", async () => {
  await adminApi.fulfillmentAction("a", "dispatch", { trackingCarrier: "Intelcom", trackingNumber: "X1", trackingUrl: "https://track.example.com/X1" });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ trackingCarrier: "Intelcom", trackingNumber: "X1", trackingUrl: "https://track.example.com/X1" });
  tx.update.mockClear();
  await expect(adminApi.fulfillmentAction("a", "dispatch", { trackingCarrier: "Intelcom", trackingNumber: "X1", trackingUrl: "javascript:alert(1)" })).rejects.toThrow("https://");
  expect(tx.update).not.toHaveBeenCalled();
 });
 it("corrects tracking and records delivery only while a manual parcel is in transit", async () => {
  await expect(adminApi.fulfillmentAction("a", "delivery_status", { status: "delivered" })).rejects.toThrow("in transit");
  records.set("orders/a", { ...base(), status: "completed", fulfillmentStatus: "shipped", trackingCarrier: "Canada Post", trackingNumber: "1" });
  await adminApi.fulfillmentAction("a", "edit_tracking", { trackingCarrier: "Canada Post", trackingNumber: "2" });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ trackingNumber: "2" });
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("fulfillmentStatus");
  tx.update.mockClear();
  await adminApi.fulfillmentAction("a", "delivery_status", { status: "out_for_delivery" });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ fulfillmentStatus: "out_for_delivery" });
  tx.update.mockClear();
  await adminApi.fulfillmentAction("a", "delivery_status", { status: "delivered" });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ fulfillmentStatus: "delivered" });
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("paymentStatus");
  // A Shippo label keeps its carrier and number; only the customer's tracking link changes.
  records.set("orders/a", { ...base(), status: "completed", fulfillmentStatus: "shipped", labelUrl: "label", trackingCarrier: "canada_post", trackingNumber: "SH1" });
  tx.update.mockClear();
  await adminApi.fulfillmentAction("a", "edit_tracking", { trackingCarrier: "UPS", trackingNumber: "3", trackingUrl: "https://track.example.com/SH1" });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ trackingUrl: "https://track.example.com/SH1" });
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("trackingNumber");
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("trackingCarrier");
  await expect(adminApi.fulfillmentAction("a", "edit_tracking", { trackingUrl: "javascript:alert(1)" })).rejects.toThrow("https://");
 });
 it("resends the shipping email only for tracked parcels in transit, without changing status", async () => {
  await expect(adminApi.fulfillmentAction("a", "resend_shipping_email")).rejects.toThrow("in transit");
  records.set("orders/a", { ...base(), status: "completed", fulfillmentStatus: "shipped", trackingCarrier: "UPS", trackingNumber: "1Z" });
  await adminApi.fulfillmentAction("a", "resend_shipping_email");
  expect(tx.update.mock.calls[0][1]).toHaveProperty("shippingEmailRequestedAt");
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("fulfillmentStatus");
 });
 it("rejects a stale checklist without writing anything", async () => { records.set("order-operations/a", { addressReviewed: addressKey(base()) }); await expect(adminApi.fulfillmentAction("a", "pack", { packingKey: "stale" })).rejects.toThrow("Items changed"); expect(tx.update).not.toHaveBeenCalled(); expect(tx.set).not.toHaveBeenCalled(); });
 it("rejects unpaid dispatch and incomplete preparation", async () => { records.set("orders/a", { ...base(), paymentStatus: "unpaid" }); await expect(adminApi.fulfillmentAction("a", "dispatch", {})).rejects.toThrow(); expect(tx.update).not.toHaveBeenCalled(); });
 it("stores new internal notes only in private operations", async () => { await adminApi.addOrderNote("a", "Customer issue"); expect(tx.update).not.toHaveBeenCalled(); expect(tx.set.mock.calls[0][0].path).toBe("order-operations/a"); });
 it("prevents changing the address after buying a label", async () => { records.set("orders/a", { ...base(), labelUrl: "label" }); await expect(adminApi.correctOrderAddress("a", base().customer.address, addressKey(base()))).rejects.toThrow("after label purchase"); expect(tx.update).not.toHaveBeenCalled(); });
 it("allows local-delivery street corrections but protects the paid delivery area", async () => {
  const o: any = { ...base(), fulfillmentSelection: { method: "local_delivery", optionId: "zone" } };
  records.set("orders/a", o); records.set("order-operations/a", {});
  await adminApi.correctOrderAddress("a", { ...o.customer.address, street: "2 Main" }, addressKey(o));
  expect(tx.update).toHaveBeenCalled(); tx.update.mockClear();
  await expect(adminApi.correctOrderAddress("a", { ...o.customer.address, zip: "V6B1A1" }, addressKey(o))).rejects.toThrow("Cancel and refund");
  expect(tx.update).not.toHaveBeenCalled();
 });
 it("does not offer customer address correction for pickup orders", async () => {
  const o: any = { ...base(), fulfillmentSelection: { method: "pickup", optionId: "pickup" } };
  records.set("orders/a", o);
  await expect(adminApi.correctOrderAddress("a", o.customer.address, addressKey(o))).rejects.toThrow("do not have a customer shipping address");
 });
 it("advances a packed pickup transactionally without address review", async () => {
  const o: any = { ...base(), customer: { address: {} }, fulfillmentSelection: { method: "pickup", optionId: "shop" } };
  records.set("orders/a", o); records.set("order-operations/a", { packed: packingKey(o), activity: [] });
  await adminApi.fulfillmentAction("a", "local_transition", { expectedStatus: "" });
  expect(tx.update).toHaveBeenCalledWith({ path: "orders/a" }, expect.objectContaining({ fulfillmentStatus: "ready_for_pickup" }));
  records.set("orders/a", { ...o, fulfillmentStatus: "ready_for_pickup" });
  await expect(adminApi.fulfillmentAction("a", "local_transition", { expectedStatus: "" })).rejects.toThrow("changed");
 });
 it("requires reviewed delivery address and refuses held or unpacked local orders", async () => {
  const o: any = { ...base(), fulfillmentSelection: { method: "local_delivery", optionId: "zone" } };
  records.set("orders/a", o); records.set("order-operations/a", { packed: packingKey(o), activity: [] });
  await expect(adminApi.fulfillmentAction("a", "local_transition", { expectedStatus: "" })).rejects.toThrow("Review and confirm");
  records.set("order-operations/a", { packed: packingKey(o), addressReviewed: addressKey(o), hold: "Pause", activity: [] });
  await expect(adminApi.fulfillmentAction("a", "local_transition", { expectedStatus: "" })).rejects.toThrow("hold");
  records.set("order-operations/a", { addressReviewed: addressKey(o), activity: [] });
  await expect(adminApi.fulfillmentAction("a", "local_transition", { expectedStatus: "" })).rejects.toThrow("packing");
 });
 it("does not permit carrier dispatch for a local order", async () => {
  const o: any = { ...base(), fulfillmentSelection: { method: "pickup", optionId: "shop" } };
  records.set("orders/a", o); records.set("order-operations/a", { packed: packingKey(o), activity: [] });
  await expect(adminApi.fulfillmentAction("a", "dispatch", { trackingCarrier: "Courier", trackingNumber: "123" })).rejects.toThrow("cannot use carrier dispatch");
 });
});
