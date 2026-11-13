import { describe, expect, it } from "vitest";
import { accountRequestLine, requestOptions } from "./OrderRequests";

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

describe("the account's request line", () => {
  const on = { enabled: true, windowDays: 30 };
  it("offers a return from the account only while the shop takes returns", () => {
    expect(accountRequestLine(delivered, null, now)).toBeNull();
    const line = accountRequestLine(delivered, on, now);
    expect(line).toMatchObject({ kind: "ask", cancel: false, return: true });
    expect(line && line.kind === "ask" && line.deadline).toBeTruthy();
    expect(accountRequestLine({ paymentStatus: "paid", status: "paid" }, null, now)).toEqual({ kind: "ask", cancel: true, return: false, deadline: null });
  });
  it("shows a request already sent, and how a return is going", () => {
    expect(accountRequestLine({ ...delivered, customerRequest: { status: "open", type: "return" } }, on, now)).toEqual({ kind: "open", key: "trackReqOpenReturn" });
    expect(accountRequestLine({ ...delivered, returnProgress: { state: "received" } }, on, now)).toEqual({ kind: "progress", key: "trackReturn_received" });
  });
});
