// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const link = vi.hoisted(() => ({
  status: vi.fn(),
  check: vi.fn(async () => ({ connection: { ok: true } })),
  catalog: vi.fn(async () => ({ books: [{ id: "hound", title: "The Hound", author: "", isbn: "", currency: "", maxPrint: 300, onHand: 12, feedAt: null }] })),
  saveLinks: vi.fn(async (links: any) => ({ links, errors: [] })),
  setOptions: vi.fn(async () => ({ saved: {} })),
  startSales: vi.fn(async () => ({ startDay: "2026-09-01", run: {} })),
  preview: vi.fn(),
  apply: vi.fn(),
  syncNow: vi.fn(),
  checkDetails: vi.fn(async () => { throw new Error("offline"); }),
  applyDetail: vi.fn(),
  keepDetail: vi.fn(async (id: string, signature: string) => ({ keptDetails: { [id]: signature } })),
}));
vi.mock("./inventoryLinkApi", () => ({ inventoryLinkApi: link }));
vi.mock("./inventoryApi", () => ({ inventoryApi: { stockAlerts: vi.fn(async () => [{ status: "waiting", email: "a@x.com", variantId: null }]) } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { InventoryLinkPanel } = await import("./InventoryLinkPanel");
const { ToastProvider } = await import("./riso/components");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const books = [{ id: "b1", title: "The Hound", format: "Paperback", trackInventory: true, stockLevel: 0, status: "published" }];
const status = (state: any) => ({ state, undelivered: 0, unlinkedOrders: 0, earliestPaidDay: "2026-09-01", serviceAccount: "123-compute@developer.gserviceaccount.com", busy: false, today: "2026-10-11" });
const mount = async (onStockChanged = vi.fn()) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(ToastProvider, null, h(InventoryLinkPanel, { books, onStockChanged }))));
  await flush();
};
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

describe("InventoryLinkPanel", () => {
  it("starts at the connection step with the address to grant", async () => {
    link.status.mockResolvedValue(status({}));
    await mount();
    const text = document.body.textContent || "";
    expect(text).toContain("Not connected yet");
    expect(text).toContain("123-compute@developer.gserviceaccount.com");
    expect(text).toContain("Cloud Datastore User");
    expect(text).toContain("Connect first");
    await act(async () => { button("Check connection").click(); });
    await flush();
    expect(link.check).toHaveBeenCalled();
  });

  it("suggests and saves book matches once connected", async () => {
    link.status.mockResolvedValue(status({ connection: { ok: true } }));
    await mount();
    expect(document.body.textContent).toContain("Suggested: The Hound");
    await act(async () => { button("Use suggestions").click(); });
    await act(async () => { button("Save matches").click(); });
    await flush();
    expect(link.saveLinks).toHaveBeenCalledWith({ b1: { _: "hound" } });
  });

  it("previews stock, warns about back-in-stock emails, and applies that exact preview", async () => {
    link.status.mockResolvedValue(status({ connection: { ok: true }, links: { b1: { _: "hound" } }, startDay: "2026-09-01", backfill: { done: true, sent: 4 } }));
    link.preview.mockResolvedValue({ run: {}, stock: { hash: "h1", rows: [{ bookId: "b1", variantId: null, inventoryBookId: "hound", title: "The Hound", edition: "", from: 0, to: 11, hold: null, appOnHand: 12, feedAt: null, webCopies: 3, webTotal: 4 }] } });
    link.apply.mockResolvedValue({ run: {}, stock: { hash: "h1", rows: [], applied: [{ result: "applied" }] } });
    const onStockChanged = vi.fn();
    await mount(onStockChanged);
    expect(document.body.textContent).toContain("Past orders: all sent (4)");
    await act(async () => { button("Preview stock changes").click(); });
    await flush();
    const text = document.body.textContent || "";
    expect(text).toContain("1 website sale not in the inventory app yet");
    await act(async () => { button("Apply these numbers").click(); });
    await flush();
    expect(document.body.textContent).toContain("1 reader is waiting");
    await act(async () => { [...document.querySelectorAll("button")].filter((b) => b.textContent === "Apply").pop()!.click(); });
    await flush();
    expect(link.apply).toHaveBeenCalledWith("h1");
    expect(onStockChanged).toHaveBeenCalled();
  });

  it("automatic stock stays off until the first confirmed apply", async () => {
    link.status.mockResolvedValue(status({ connection: { ok: true }, links: { b1: { _: "hound" } }, startDay: "2026-09-01", backfill: { done: true } }));
    await mount();
    const toggle = [...document.querySelectorAll("input[type=checkbox], button[role=switch]")].find((el) => el.closest("label")?.textContent?.includes("automatically") || el.getAttribute("aria-label")?.includes("automatically")) as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.disabled).toBe(true);
  });

  it("lists details that differ and copies the app's value only after the owner confirms", async () => {
    const price = { id: "hound|price", inventoryBookId: "hound", bookId: "b1", variantId: null, field: "price", title: "The Hound", shop: "65.00", app: "70.00" };
    const author = { ...price, id: "hound|author", field: "author", shop: "Ana", app: "" };
    link.status.mockResolvedValue(status({ connection: { ok: true }, links: { b1: { _: "hound" } }, detailDiffs: { at: "x", items: [price, author] } }));
    link.checkDetails.mockResolvedValueOnce({ detailDiffs: { at: "y", items: [price, author] } });
    link.applyDetail.mockResolvedValue({ applied: price, detailDiffs: { at: "z", items: [author] } });
    const onStockChanged = vi.fn();
    await mount(onStockChanged);
    expect(link.checkDetails).toHaveBeenCalledTimes(1);
    const text = document.body.textContent || "";
    expect(text).toContain("Details that differ from the app");
    expect(text).toContain("Website: CA$65.00 · Inventory app: CA$70.00");
    // Nothing to copy from an empty app value: only "Leave as is" is offered for the author.
    expect([...document.querySelectorAll("button")].filter((b) => b.textContent === "Use the app's")).toHaveLength(1);
    await act(async () => { button("Use the app's").click(); });
    await flush();
    expect(link.applyDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Shoppers pay the new price from now on.");
    await act(async () => { button("Use the app's price").click(); });
    await flush();
    expect(link.applyDetail).toHaveBeenCalledWith("hound|price", JSON.stringify(["65.00", "70.00"]));
    expect(document.body.textContent).not.toContain("CA$70.00");
    expect(onStockChanged).toHaveBeenCalled();
    await act(async () => { button("Leave as is").click(); });
    await flush();
    expect(link.keepDetail).toHaveBeenCalledWith("hound|author", JSON.stringify(["Ana", ""]));
    expect(document.body.textContent).not.toContain("Details that differ from the app");
  });
});
