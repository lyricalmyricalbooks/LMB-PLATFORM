// @vitest-environment jsdom
// The fair helper's till in the admin: sells from the owner's menu at the owner's prices, keeps a sale on the phone
// until the server has it (and sends it again after a reload), and undoes a wrong tap.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {} }));

import { FairHelperDesk } from "./FairHelperDesk";
import { mySales, pruneQueue, readQueue, toResend, writeQueue } from "./stockroom/helperTill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MENU = { at: "2026-11-14T10:00:00Z", books: [
  { id: "salt", title: "Salt Almanac", price: 18, cur: "CAD", onHand: 3 },
  { id: "moth", title: "Moth Songs", price: 12, cur: "CAD", onHand: null },
] };

function fakeApi() {
  let mine: (s: any[]) => void = () => {};
  const api = {
    watchMenu: vi.fn((cb: (m: any) => void) => { cb(MENU); return () => {}; }),
    watchMine: vi.fn((_e: string, cb: (s: any[]) => void) => { mine = cb; cb([]); return () => {}; }),
    addSale: vi.fn(async () => {}),
    cancelSale: vi.fn(async () => {}),
    cardPay: vi.fn(async () => ({ error: "no" })),
    watchSales: vi.fn(), claim: vi.fn(), writeMenu: vi.fn(),
  };
  return { api, server: (s: any[]) => mine(s) };
}

async function mount(api: any) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<FairHelperDesk email="Sam@Example.com" appearance="light" api={api} />); });
  return host;
}
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ""; });

describe("the helper's queue", () => {
  it("keeps sales per helper until the server has its own copy", () => {
    const q = [{ id: "fs-1-aaaaaaaa", doc: { by: "sam@example.com", lines: [] } }, { id: "fs-2-bbbbbbbb", doc: { by: "sam@example.com", lines: [] } }];
    expect(writeQueue("Sam@Example.com", q as any)).toBe(true);
    expect(readQueue("sam@example.com")).toHaveLength(2);
    expect(readQueue("kim@example.com")).toEqual([]);
    const server = [{ id: "fs-1-aaaaaaaa" }, { id: "fs-2-bbbbbbbb", pending: true }];
    expect(pruneQueue(q as any, server).map((x) => x.id)).toEqual(["fs-2-bbbbbbbb"]);
    expect(toResend(q as any, [{ id: "fs-1-aaaaaaaa" }]).map((x) => x.id)).toEqual(["fs-2-bbbbbbbb"]);
    expect(mySales([{ id: "fs-1-aaaaaaaa" }], q as any).map((s) => [s.id, !!s.pending])).toEqual([["fs-1-aaaaaaaa", false], ["fs-2-bbbbbbbb", true]]);
  });
});

describe("FairHelperDesk", () => {
  it("rings up a cash sale at the menu's prices and sends it to the owner's inbox", async () => {
    const { api } = fakeApi();
    const host = await mount(api);
    expect(host.textContent).toContain("Fair till");
    expect(host.textContent).toContain("3 left");
    await click(host.querySelector('[aria-label^="Add Salt Almanac"]'));
    await click(host.querySelector('[aria-label^="Add Salt Almanac"]'));
    expect(host.textContent).toContain("1 left");
    await click(button(host, "Cash"));
    expect(api.addSale).toHaveBeenCalledTimes(1);
    const [id, doc] = api.addSale.mock.calls[0] as unknown as [string, any];
    expect(id).toMatch(/^fs-/);
    expect(doc).toMatchObject({ by: "sam@example.com", method: "Cash", lines: [{ bookId: "salt", qty: 2, price: 18, cur: "CAD" }] });
    expect(host.textContent).toContain("Sold 2");
    expect(readQueue("sam@example.com").map((q) => q.id)).toEqual([id]);
  });

  it("undoes the last sale and puts it back in the cart", async () => {
    const { api } = fakeApi();
    const host = await mount(api);
    await click(host.querySelector('[aria-label^="Add Moth Songs"]'));
    await click(button(host, "Card reader"));
    const [id] = api.addSale.mock.calls[0] as unknown as [string];
    await click(button(host, "Undo"));
    expect(api.cancelSale).toHaveBeenCalledWith(id);
    expect(host.textContent).toContain("Sale undone");
    expect(host.querySelector(".rp-till-lines")?.textContent).toContain("Moth Songs × 1");
  });

  it("sends a sale kept on the phone from an earlier visit that the server never got", async () => {
    writeQueue("sam@example.com", [{ id: "fs-old-12345678", doc: { by: "sam@example.com", day: "2026-11-14", fair: "", method: "Cash", lines: [] } }]);
    const { api, server } = fakeApi();
    await mount(api);
    expect(api.addSale).toHaveBeenCalledWith("fs-old-12345678", expect.objectContaining({ method: "Cash" }));
    await act(async () => { server([{ id: "fs-old-12345678", by: "sam@example.com", lines: [] }]); });
    expect(readQueue("sam@example.com")).toEqual([]);
  });
});
