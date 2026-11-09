// Settings › Apps: each app request in plain words.
import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/firebase", () => ({ db: {} }));
const { activityRow } = await import("./appActivity");

describe("app activity rows", () => {
  it("names what the app did, and why a change was refused", () => {
    expect(activityRow("r1", { op: "order.dispatch", appName: "Parcel Pal", createdAt: "2026-11-04T15:00:00Z", status: "done", input: { orderId: "A-1", trackingCarrier: "Canada Post", trackingNumber: "1234" } }))
      .toEqual({ id: "r1", app: "Parcel Pal", what: "Marked order A-1 sent (Canada Post 1234)", when: "2026-11-04T15:00:00Z", state: "done", reason: "" });
    expect(activityRow("r2", { op: "order.dispatch", appName: "Parcel Pal", status: "refused", reason: "Order on hold: author", input: { orderId: "A-2", shipped: false, trackingCarrier: "UPS", trackingNumber: "1Z" } }))
      .toMatchObject({ what: "Added tracking to order A-2", state: "refused", reason: "Order on hold: author" });
    expect(activityRow("r3", { op: "inventory.adjust", appId: "app_1", input: { productId: "tote", variantId: "l", change: -2 } }))
      .toMatchObject({ app: "app_1", what: "Took away 2 of tote (l)", state: "waiting" });
    expect(activityRow("r5", { op: "inventory.adjust", status: "done", result: { available: 3, title: "Moth Songs" }, input: { productId: "b1", change: 2 } }).what).toBe("Added 2 of Moth Songs");
    expect(activityRow("r4", { op: "order.markPaid" }).what).toBe("Asked for a change the shop doesn't know");
  });
});
