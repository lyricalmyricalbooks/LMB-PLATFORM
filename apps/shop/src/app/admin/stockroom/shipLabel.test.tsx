// @vitest-environment jsdom
// Stockroom › Shipping › Buy label: which rows get the button, the confirm before any money is spent, and the row leaving
// the waiting list once the label is bought. Every server call is a fake; nothing reaches a carrier.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  getParcelPresets: vi.fn(async () => []),
  saveParcelPresets: vi.fn(),
  getCanadaPostLabelRates: vi.fn(),
  buyCanadaPostLabel: vi.fn(),
}));
vi.mock("../api", () => ({ adminApi: api }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { addressKey, packingKey } from "../fulfillment";
import { ShippingBoard } from "./ShippingPage";
import { joinShopOrders, orderHasGone, shopOrderId, type ShippingView, type WaitingOrder } from "./shipping";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const row = (num: string, extra: Partial<WaitingOrder> = {}): WaitingOrder =>
  ({ key: num, num, customer: `Customer ${num}`, titles: ["Salt Hours"], qty: 1, days: 3, late: false, destination: "Toronto, Canada", ...extra });

function readyOrder(id: string, extra: object = {}) {
  const o: any = {
    id, orderId: id, status: "paid", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shippingMethod: "Canada Post Expedited Parcel", shipping: 14,
    customer: { name: "Cleo Example", email: "cleo@example.com", address: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
    items: [{ id: "b1", title: "Salt Hours", quantity: 1, price: 20, weightGrams: 400 }], ...extra,
  };
  o.operations = { addressReviewed: addressKey(o), packed: packingKey(o) };
  return o;
}

describe("matching waiting rows to website orders", () => {
  it("reads an order number as a website order id only when it can be one", () => {
    expect(shopOrderId("#WEB-1041")).toBe("WEB-1041");
    expect(shopOrderId(" 1001 ")).toBe("1001");
    expect(shopOrderId("")).toBe("");
    expect(shopOrderId("a/b")).toBe("");
  });

  it("drops a row whose order already has a label or left, and marks the ones that can get one", () => {
    expect(orderHasGone({ labelUrl: "x" })).toBe(true);
    expect(orderHasGone({ fulfillmentStatus: "shipped" })).toBe(true);
    expect(orderHasGone({ status: "paid", fulfillmentStatus: "unfulfilled" })).toBe(false);
    const joined = joinShopOrders([row("A-1"), row("A-2"), row("A-3")], { "A-1": { id: "A-1" }, "A-2": { id: "A-2", trackingNumber: "7023" }, "A-3": null });
    expect(joined.map((r) => [r.key, r.shopOrderId])).toEqual([["A-1", "A-1"], ["A-3", undefined]]);
  });
});

describe("Buy label on Shipping", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const view: ShippingView = { waiting: [row("WEB-1041"), row("OLD-7"), row("WEB-1044")], losses: [], lossTotal: 0, websiteOrders: 3 };
  const buttons = () => Array.from(container.querySelectorAll("button"));
  const press = async (text: string) => {
    const b = buttons().find((x) => x.textContent?.startsWith(text));
    if (!b) throw new Error(`No button "${text}" in: ${buttons().map((x) => x.textContent).join(" | ")}`);
    await act(async () => { b.click(); });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    Object.values(api).forEach((f) => f.mockClear());
    const orders: Record<string, any> = { "WEB-1041": readyOrder("WEB-1041"), "WEB-1044": readyOrder("WEB-1044", { labelUrl: "https://labels.example/1.pdf", trackingNumber: "7023" }) };
    api.getOrderById.mockImplementation(async (id: string) => orders[id] ?? null);
    api.getCanadaPostLabelRates.mockResolvedValue({ shipmentId: "shp_1", rates: [{ id: "rate_1", name: "Expedited Parcel", amount: "12.40", currency: "CAD", estimatedDays: 2 }] });
    api.buyCanadaPostLabel.mockImplementation(async (id: string) => { orders[id] = { ...orders[id], labelUrl: "https://labels.example/2.pdf", trackingNumber: "7024" }; return {}; });
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it("offers Buy label only on website orders still without a label, confirms, buys once and drops the row", async () => {
    await act(async () => { root.render(<ShippingBoard view={view} />); });
    const table = () => container.querySelector("table")!.textContent || "";
    expect(table()).toContain("#WEB-1041");
    expect(table()).toContain("#OLD-7");
    expect(table()).not.toContain("#WEB-1044");
    expect(buttons().filter((b) => b.textContent === "Buy label")).toHaveLength(1);

    await press("Buy label");
    await press("Find label rates");
    expect(api.getCanadaPostLabelRates).toHaveBeenCalledWith("WEB-1041", expect.objectContaining({ weight: "550", mass_unit: "g" }));
    await press("Buy label ·");
    expect(api.buyCanadaPostLabel).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Buy Expedited Parcel for $12.40?");

    await press("Back");
    expect(api.buyCanadaPostLabel).not.toHaveBeenCalled();
    await press("Buy label ·");
    await press("Yes, buy");
    expect(api.buyCanadaPostLabel).toHaveBeenCalledTimes(1);
    expect(api.buyCanadaPostLabel).toHaveBeenCalledWith("WEB-1041", "shp_1", "rate_1");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(container.textContent).not.toContain("#WEB-1041");
    expect(container.textContent).toContain("#OLD-7");
  });

  it("keeps the row and the dialog when the server refuses the purchase", async () => {
    api.buyCanadaPostLabel.mockRejectedValueOnce(new Error("A label purchase is pending. Check Shippo first."));
    await act(async () => { root.render(<ShippingBoard view={view} />); });
    await press("Buy label");
    await press("Find label rates");
    await press("Buy label ·");
    await press("Yes, buy");
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(container.querySelector("table")!.textContent).toContain("#WEB-1041");
  });

  it("sends an order that isn't ready back to its page instead of buying", async () => {
    const notPacked = readyOrder("WEB-1041");
    notPacked.operations.packed = "";
    api.getOrderById.mockImplementation(async (id: string) => (id === "WEB-1041" ? notPacked : null));
    await act(async () => { root.render(<ShippingBoard view={view} />); });
    await press("Buy label");
    expect(document.body.textContent).toContain("Complete the packing checklist first.");
    expect(document.querySelector('a[href="#orders/WEB-1041"]')).not.toBeNull();
    expect(buttons().find((b) => b.textContent === "Find label rates")!.disabled).toBe(true);
  });
});
