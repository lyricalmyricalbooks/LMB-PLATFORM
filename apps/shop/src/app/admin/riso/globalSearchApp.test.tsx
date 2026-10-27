// @vitest-environment jsdom
// The admin search also finds the inventory app's books (docs/INVENTORY_LINK.md › One search box).
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const opened = vi.hoisted(() => [] as string[]);
vi.mock("../api", () => ({ adminApi: { getAllBooks: vi.fn(async () => [{ id: "w1", title: "Moth Hours", author: "Ana Ruiz" }]) } }));
vi.mock("../ordersCache", () => ({ getOrdersCached: vi.fn(async () => []) }));
vi.mock("../appSwitch", async (real) => ({ ...(await real<any>()), openInventoryApp: (_w: any, url: string) => { opened.push(url); return true; } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { GlobalSearch } = await import("./shellParts");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; opened.length = 0; });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async (props: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(GlobalSearch, { destinations: [], onOpenBook: () => {}, ...props })));
  await flush();
};
const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent || "");

describe("admin search across the apps", () => {
  // First: the catalog is read once per page, so this must run before the others load it.
  it("shows no app rows while the website's own books are still loading, so Enter can't jump to the app", async () => {
    const { adminApi } = await import("../api");
    let fail: (e: Error) => void = () => {};
    (adminApi.getAllBooks as any).mockImplementationOnce(() => new Promise((_ok, no) => { fail = no; }));
    await mount({ appConnected: true, appBooks: [{ id: "moth-app", title: "Moth Hours", author: "", isbn: "" }], request: { q: "zz", n: 1 } });
    expect(document.body.textContent).toContain("Loading…");
    expect(document.body.textContent).not.toContain("In the inventory app");
    // A failed read is forgotten, so the next test reads the catalog afresh.
    await act(async () => { fail(new Error("offline")); });
    await flush();
  });
  it("opens with a #search= request, lists the app's books after the website's, and opens them in the app", async () => {
    await mount({ appConnected: true, appBooks: [{ id: "moth-app", title: "Moth Hours", author: "", isbn: "" }], request: { q: "moth", n: 1 } });
    expect((document.querySelector("input[type='search']") as HTMLInputElement).value).toBe("moth");
    expect(document.body.textContent).toContain("In the inventory app");
    const rows = options();
    expect(rows[0]).toContain("Moth Hours");
    expect(rows.at(-1)).toContain("Search the inventory app for “moth”");
    const appRow = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("Inventory app")) as HTMLElement;
    await act(async () => { appRow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(opened[0]).toContain("#book=moth-app");
  });
  it("offers nothing from the app while the link isn't connected", async () => {
    await mount({ appConnected: false, appBooks: [{ id: "moth-app", title: "Moth Hours", author: "", isbn: "" }], request: { q: "moth", n: 1 } });
    expect(document.body.textContent).not.toContain("In the inventory app");
  });
});

