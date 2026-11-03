// @vitest-environment jsdom
// Admin › Orders › Bring past orders over (plan 23.7): the file is previewed, sent to the server, and the result shown.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  importPastOrders: vi.fn(async (orders: any[]) => ({
    added: orders.length - 1, skipped: [{ oldRef: orders[orders.length - 1].oldRef, reason: "already brought over" }],
  })),
}));
vi.mock("./oldShopApi", () => api);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { PastOrdersDialog } = await import("./PastOrdersDialog");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const button = (text: RegExp) => [...document.querySelectorAll("button")].find((b) => text.test(b.textContent || "")) as HTMLButtonElement;

async function choose(text: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File([text], "orders_export.csv", { type: "text/csv" })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await flush();
}

const FILE = [
  "Name,Email,Financial Status,Created at,Total,Currency,Lineitem name,Lineitem quantity,Lineitem price",
  "#1001,ada@example.com,paid,2025-06-01 15:30:00 -0400,64.24,CAD,Moth Songs,2,20.00",
  "#1001,,,,,,Zine,1,8.00",
  "#1002,ben@example.com,paid,2025-07-02 10:00:00 -0400,30.00,CAD,Zine,1,30.00",
  "#1003,cy@example.com,pending,2025-07-03 10:00:00 -0400,12.00,CAD,Zine,1,12.00",
].join("\n");

describe("Bring past orders over", () => {
  it("previews the file, sends the orders and reports what came over", async () => {
    const onDone = vi.fn();
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone })));
    expect(button(/Nothing to bring over/).disabled).toBe(true);
    await choose(FILE);
    const text = document.body.textContent || "";
    expect(text).toContain("2 orders");
    expect(text).toContain("CA$94.24 in sales");
    expect(text).toContain("2 customers");
    expect(text).toContain("1 order left out");
    await act(async () => { button(/Bring 2 past orders over/).click(); });
    await flush();
    expect(api.importPastOrders).toHaveBeenCalledTimes(1);
    expect(api.importPastOrders.mock.calls[0][0].map((o: any) => o.oldRef)).toEqual(["order:#1001", "order:#1002"]);
    expect(onDone).toHaveBeenCalled();
    expect(document.body.textContent).toContain("1 past order added");
    expect(document.body.textContent).toContain("Order #1002: already brought over");
  });

  it("orders in another currency wait for the owner's rate, then come over converted", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone: () => {} })));
    await choose([
      "Name,Email,Financial Status,Created at,Total,Currency",
      "#1,ada@example.com,paid,2025-06-01,10.00,CAD",
      "#2,ben@example.com,paid,2025-06-02,30.00,USD",
    ].join("\n"));
    expect(document.body.textContent).toContain("1 order waiting for a rate");
    expect(button(/Bring 1 past order over/)).toBeTruthy();
    const rate = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(rate, "1.4"); rate.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(document.body.textContent).toContain("CA$52.00 in sales");
    await act(async () => { button(/Bring 2 past orders over/).click(); });
    await flush();
    expect(api.importPastOrders.mock.calls[0][0][1]).toMatchObject({ currency: "CAD", total: 42, paidIn: { currency: "USD", total: 30, rate: 1.4 } });
  });

  it("a file that isn't a list of orders says what it needs and sends nothing", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone: () => {} })));
    await choose("Title,Price\nMoth Songs,20");
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/number, its date and its total/);
    expect(button(/Nothing to bring over/).disabled).toBe(true);
    expect(api.importPastOrders).not.toHaveBeenCalled();
  });
});
