// @vitest-environment jsdom
// Admin › Orders › Bring past orders over (plan 23.7): the file is previewed, sent to the server, and the result shown.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  importPastOrders: vi.fn(async (orders: any[]) => ({
    added: orders.length - 1, skipped: [{ oldRef: orders[orders.length - 1].oldRef, reason: "already brought over" }],
  })),
  removePastOrders: vi.fn(async () => 1),
  suggestedRates: vi.fn(async () => ({ USD: 1.3714 })),
}));
vi.mock("./oldShopApi", () => api);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { PastOrdersDialog } = await import("./PastOrdersDialog");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const button = (text: RegExp) => [...document.querySelectorAll("button")].find((b) => text.test(b.textContent || "")) as HTMLButtonElement;

async function choose(text: string, name = "orders_export.csv") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File([text], name, { type: "text/csv" })], configurable: true });
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
    // The whole run can be taken back (plan 23.15), after a second click.
    const run = api.importPastOrders.mock.calls[0][1];
    expect(run).toMatch(/^run-[a-z0-9-]{4,}$/);
    await act(async () => { button(/Take this import back/).click(); });
    expect(api.removePastOrders).not.toHaveBeenCalled();
    await act(async () => { button(/Yes, remove them/).click(); });
    await flush();
    expect(api.removePastOrders).toHaveBeenCalledWith(run);
    expect(document.body.textContent).toContain("1 past order removed");
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(api.suggestedRates).not.toHaveBeenCalled(); // every order was in Canadian dollars
  });

  it("orders in another currency wait for the owner's rate, then come over converted", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone: () => {} })));
    await choose([
      "Name,Email,Financial Status,Created at,Total,Currency",
      "#1,ada@example.com,paid,2025-06-01,10.00,CAD",
      "#2,ben@example.com,paid,2025-06-02,30.00,USD",
    ].join("\n"));
    // The Bank of Canada's average for the dates is filled in as a start (plan 23.14).
    expect(api.suggestedRates).toHaveBeenCalledWith(["USD"], "2025-06-02", "2025-06-02");
    const rate = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(rate.value).toBe("1.3714");
    expect(document.body.textContent).toContain("Bank of Canada average");
    expect(button(/Bring 2 past orders over/)).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(rate, "1.4"); rate.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(document.body.textContent).toContain("CA$52.00 in sales");
    await act(async () => { button(/Bring 2 past orders over/).click(); });
    await flush();
    expect(api.importPastOrders.mock.calls[0][0][1]).toMatchObject({ currency: "CAD", total: 42, paidIn: { currency: "USD", total: 30, rate: 1.4 } });
    // An order already here from an earlier run keeps that run's rate (plan 23.18), until one press gives it the new
    // one (plan 23.23): only that order is sent again, asking for the new rate.
    expect(document.body.textContent).toContain("1 order sold in another currency was already here from an earlier import, so it keeps the rate used then.");
    expect(document.body.textContent).toContain("(USD at 1.4)");
    api.importPastOrders.mockResolvedValueOnce({ added: 0, rerated: 1, skipped: [] } as any);
    await act(async () => { button(/Use the new rate for that order/).click(); });
    await flush();
    const [sent, , options] = api.importPastOrders.mock.calls[1] as any[];
    expect(sent.map((o: any) => o.number)).toEqual(["#2"]);
    expect(options).toEqual({ rerate: true });
    expect(document.body.textContent).toContain("1 order now uses the new rate.");
  });

  it("adds a second file to the same run, each order once (plan 23.27)", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone: () => {} })));
    await choose("Name,Created at,Total,Currency\n#1,2024-06-01,10.00,CAD\n#2,2024-07-01,20.00,CAD", "2024.csv");
    expect(button(/Bring 2 past orders over/)).toBeTruthy();
    act(() => button(/Add another file/).click());
    await choose("Name,Created at,Total,Currency\n#2,2024-07-01,20.00,CAD\n#3,2025-01-05,30.00,CAD", "2025.csv");
    expect(document.body.textContent).toContain("2024.csv, 2025.csv");
    await act(async () => { button(/Bring 3 past orders over/).click(); });
    await flush();
    // One run: one batch name for every order, so one take-back removes them all.
    expect(api.importPastOrders).toHaveBeenCalledTimes(1);
    expect(api.importPastOrders.mock.calls[0][0].map((o: any) => o.number)).toEqual(["#1", "#2", "#3"]);
    expect(document.body.textContent).toContain("Wrong file? Take this import back");
  });

  it("brings the next file in the same window, as a run of its own (plan 23.32)", async () => {
    const onClose = vi.fn();
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose, onDone: () => {} })));
    await choose("Name,Created at,Total,Currency\n#1,2024-06-01,10.00,CAD\n#2,2024-07-01,20.00,CAD", "2024.csv");
    await act(async () => { button(/Bring 2 past orders over/).click(); });
    await flush();
    act(() => button(/Bring another file/).click());
    // Back at the chooser, with nothing left over from the first file.
    expect(button(/Nothing to bring over/).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("2024.csv");
    await choose("Name,Created at,Total,Currency\n#3,2025-01-05,30.00,CAD", "2025.csv");
    await act(async () => { button(/Bring 1 past order over/).click(); });
    await flush();
    expect(api.importPastOrders).toHaveBeenCalledTimes(2);
    expect(api.importPastOrders.mock.calls[1][0].map((o: any) => o.number)).toEqual(["#3"]);
    // Each file is its own run, so taking the second back leaves the first alone.
    expect(api.importPastOrders.mock.calls[1][1]).not.toBe(api.importPastOrders.mock.calls[0][1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("without a suggestion, an other-currency order waits for the owner's rate", async () => {
    api.suggestedRates.mockRejectedValueOnce(new Error("offline"));
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(PastOrdersDialog, { onClose: () => {}, onDone: () => {} })));
    await choose("Name,Created at,Total,Currency\n#1,2025-06-01,10.00,CAD\n#2,2025-06-02,30.00,USD");
    expect(document.body.textContent).toContain("1 order waiting for a rate");
    expect(button(/Bring 1 past order over/)).toBeTruthy();
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
