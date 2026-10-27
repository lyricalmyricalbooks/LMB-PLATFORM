import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVENTORY_APP_URL, INVENTORY_TAB_NAME, forgetOpenedTab, inventoryLinkView, inventoryOrderUrl, inventoryWaiting,
  isInstalledApp, openInventoryApp, orderInInventoryApp,
} from "./appSwitch";

// A cross-origin tab: its address can be set but not read.
function otherAppTab() {
  const tab: any = { closed: false, focus: vi.fn(), set: [] as string[] };
  tab.location = {
    get href() { throw new DOMException("Blocked a frame", "SecurityError"); },
    set href(v: string) { tab.set.push(v); },
    replace: vi.fn(),
  };
  return tab;
}
function blankTab() {
  const tab: any = { closed: false, focus: vi.fn() };
  tab.location = { href: "about:blank", replace: vi.fn() };
  return tab;
}
const browser = (over: any = {}) => ({
  open: vi.fn(() => null as any),
  matchMedia: () => ({ matches: false }),
  navigator: {},
  document: { referrer: "" },
  ...over,
});

beforeEach(() => forgetOpenedTab());

describe("addresses and counts", () => {
  it("deep-links an order by its id, encoded, after the #", () => {
    expect(inventoryOrderUrl("ABCD-12/34")).toBe(`${INVENTORY_APP_URL}#website-order=ABCD-12%2F34`);
  });
  it("counts only when the link is connected, and never invents a number", () => {
    expect(inventoryWaiting(null)).toBeNull();
    expect(inventoryWaiting({ pendingImport: { count: 3 } })).toBeNull();
    expect(inventoryWaiting({ connection: { ok: true } })).toBe(0);
    expect(inventoryWaiting({ connection: { ok: true }, pendingImport: { count: 3 } })).toBe(3);
    expect(inventoryWaiting({ connection: { ok: true }, pendingImport: { count: "x" } })).toBe(0);
  });
  it("keeps the day sales started being sent next to the count", () => {
    expect(inventoryLinkView({ connection: { ok: true }, startDay: "2026-10-11", pendingImport: { count: 2 } })).toEqual({ waiting: 2, startDay: "2026-10-11" });
    expect(inventoryLinkView({ connection: { ok: false }, startDay: "2026-10-11" })).toBeNull();
  });
  it("offers the inventory app only for orders the link sent (functions/inventoryLink.js countsForInventory)", () => {
    const paid = { paymentStatus: "paid", paidAt: "2026-10-12T15:00:00.000Z" };
    expect(orderInInventoryApp(paid, "2026-10-11")).toBe(true);
    expect(orderInInventoryApp({ ...paid, paymentStatus: "refunded" }, "2026-10-11")).toBe(true);
    expect(orderInInventoryApp(paid, "")).toBe(false); // sales not being sent yet
    expect(orderInInventoryApp(paid, "2026-10-13")).toBe(false); // paid before the start day
    // 02:00 UTC on the 12th is still the 11th in Toronto, so it counts from a start day of the 11th only.
    expect(orderInInventoryApp({ ...paid, paidAt: "2026-10-12T02:00:00.000Z" }, "2026-10-12")).toBe(false);
    expect(orderInInventoryApp({ ...paid, paymentStatus: "unpaid" }, "2026-10-11")).toBe(false);
    expect(orderInInventoryApp({ paymentStatus: "cancelled", paidAt: paid.paidAt }, "2026-10-11")).toBe(false);
    expect(orderInInventoryApp({ ...paid, isTest: true }, "2026-10-11")).toBe(false);
    expect(orderInInventoryApp({ paymentStatus: "paid" }, "2026-10-11")).toBe(false);
  });
});

describe("installed apps hand the link to the phone", () => {
  it("spots home-screen, Android and Install-app windows", () => {
    expect(isInstalledApp(browser({ matchMedia: () => ({ matches: true }) }))).toBe(true);
    expect(isInstalledApp(browser({ navigator: { standalone: true } }))).toBe(true);
    expect(isInstalledApp(browser({ document: { referrer: "android-app://io.github.x/" } }))).toBe(true);
    expect(isInstalledApp(browser())).toBe(false);
  });
  it("lets the plain link open in an installed app", () => {
    const win = browser({ matchMedia: () => ({ matches: true }) });
    expect(openInventoryApp(win)).toBe(false);
    expect(win.open).not.toHaveBeenCalled();
  });
});

describe("switching between browser tabs", () => {
  it("never asks the tab that opened this one to come forward (browsers ignore it): it finds that tab by name", () => {
    const opener = otherAppTab();
    opener.focus = vi.fn();
    const win = browser({ opener, document: { referrer: "https://lyricalmyricalbooks.github.io/" }, open: vi.fn(() => opener) });
    expect(openInventoryApp(win, inventoryOrderUrl("A-9"))).toBe(true);
    expect(win.open).toHaveBeenCalledWith("", INVENTORY_TAB_NAME);
    expect(opener.set).toEqual([inventoryOrderUrl("A-9")]);
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });
  it("opens a new named tab the first time, then reuses it", () => {
    const tab = blankTab();
    const win = browser({ open: vi.fn(() => tab) });
    expect(openInventoryApp(win)).toBe(true);
    expect(tab.location.replace).toHaveBeenCalledWith(INVENTORY_APP_URL);
    const url = inventoryOrderUrl("A-1");
    tab.location = { href: "x" } as any;
    expect(openInventoryApp(win, url)).toBe(true);
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe(url);
  });
  it("finds the inventory app's tab by name and only moves it for a deep link", () => {
    const tab = otherAppTab();
    const win = browser({ open: vi.fn(() => tab) });
    expect(openInventoryApp(win)).toBe(true);
    expect(tab.set).toEqual([]);
    forgetOpenedTab();
    const url = inventoryOrderUrl("A-2");
    expect(openInventoryApp(win, url)).toBe(true);
    expect(tab.set).toEqual([url]);
    expect(tab.focus).toHaveBeenCalledTimes(2);
  });
  it("falls back to the plain link when the browser blocks the new tab", () => {
    expect(openInventoryApp(browser())).toBe(false);
  });
  it("opens a fresh tab once the remembered one was closed", () => {
    const first = blankTab();
    const second = blankTab();
    const open = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const win = browser({ open });
    openInventoryApp(win);
    first.closed = true;
    openInventoryApp(win);
    expect(open).toHaveBeenCalledTimes(2);
    expect(second.location.replace).toHaveBeenCalledWith(INVENTORY_APP_URL);
  });
});

describe("search across the apps", () => {
  it("links into the app's book and search pages", async () => {
    const { inventoryBookUrl, inventorySearchUrl } = await import("./appSwitch");
    expect(inventoryBookUrl("moth/1")).toBe(`${INVENTORY_APP_URL}#book=moth%2F1`);
    expect(inventorySearchUrl(" Moth hours ")).toBe(`${INVENTORY_APP_URL}#search=Moth%20hours`);
  });
  it("finds the app's books by title, author or ISBN", async () => {
    const { matchAppBooks } = await import("./appSwitch");
    const books = [{ id: "a", title: "Moth Hours", author: "Ana Ruiz", isbn: "978-1-23456-789-7" }, { id: "b", title: "Hound", author: "", isbn: "" }];
    expect(matchAppBooks(books, "moth").map((b) => b.id)).toEqual(["a"]);
    expect(matchAppBooks(books, "ruiz").map((b) => b.id)).toEqual(["a"]);
    expect(matchAppBooks(books, "9781234").map((b) => b.id)).toEqual(["a"]);
    expect(matchAppBooks(books, "  ")).toEqual([]);
    expect(matchAppBooks(null, "moth")).toEqual([]);
  });
});
