import { describe, expect, it } from "vitest";
import { requestOptions } from "./OrderRequests";

const now = Date.parse("2026-11-10T12:00:00Z");
const delivered = { paymentStatus: "paid", status: "delivered", fulfillmentStatus: "delivered", deliveredAt: "2026-11-01T12:00:00Z", items: [{ id: "tee", quantity: 1 }] };

describe("the order page's requests", () => {
  it("offers cancel before shipping, and never a return while returns are off", () => {
    expect(requestOptions({ paymentStatus: "paid", status: "paid" }, null, now)).toEqual({ cancel: true, return: false });
    expect(requestOptions(delivered, null, now)).toEqual({ cancel: false, return: false });
    expect(requestOptions(delivered, { enabled: false, windowDays: 30 }, now)).toEqual({ cancel: false, return: false });
  });
  it("offers a return after delivery while the press's window is open", () => {
    expect(requestOptions(delivered, { enabled: true, windowDays: 30 }, now)).toEqual({ cancel: false, return: true });
    expect(requestOptions(delivered, { enabled: true, windowDays: 5 }, now)).toEqual({ cancel: false, return: false });
    expect(requestOptions({ ...delivered, paymentStatus: "refunded" }, { enabled: true, windowDays: 30 }, now)).toEqual({ cancel: false, return: false });
  });
});
