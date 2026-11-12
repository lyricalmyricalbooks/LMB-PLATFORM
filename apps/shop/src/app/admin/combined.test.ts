import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_STOCKROOM_PAGE, STOCKROOM_ITEM_PREFIX, STOCKROOM_PAGES, STOCKROOM_TAB, combinedAdmin, stockroomPage,
} from "./combined";
import { COMBINED_MENU, FAIR_MENU, MENU, NAV, STOCKROOM_SIDE, WEBSITE_SIDE, menuItemFor, sideMenu, sideOf, sidebarItems } from "./riso/nav";
import { hashForRoute, routeFromHash, sameSection } from "./adminRoute";
import { DEFAULT_SHOP_PROFILE } from "../../lib/shopProfile";
import { adminWordsFor } from "./sells";
import { NATIVE_PAGES } from "./stockroom/nativePages";

const profile = (shop: boolean, stockroom: boolean) => ({ ...DEFAULT_SHOP_PROFILE, apps: { shop, stockroom } });
const stockroomRoot = join(__dirname, "..", "..", "..", "..", "stockroom");

describe("the combined admin (shop + stockroom plan)", () => {
  it("is only for a press with both apps", () => {
    expect(combinedAdmin(profile(true, true))).toBe(true);
    expect(combinedAdmin(profile(true, false))).toBe(false);
    expect(combinedAdmin(profile(false, true))).toBe(false);
  });

  it("keeps every page of the website admin's own menu, so nothing is lost", () => {
    const combined = new Set(COMBINED_MENU.flatMap((g) => g.pages));
    for (const page of MENU.flatMap((g) => g.pages)) expect(combined.has(page), page).toBe(true);
  });

  it("holds every stockroom page once, and lists each page only once", () => {
    const pages = COMBINED_MENU.flatMap((g) => g.pages);
    expect(new Set(pages).size).toBe(pages.length);
    // To-do lives on Home (redesign, 11 November 2026) and still opens from links; the Till and QR codes are in Fair mode (v3).
    const offMenu = ["todo", "pos", "qrcodes"];
    for (const p of STOCKROOM_PAGES) expect(pages.filter((id) => id === STOCKROOM_ITEM_PREFIX + p.id), p.id).toHaveLength(offMenu.includes(p.id) ? 0 : 1);
    const fair = FAIR_MENU.flatMap((g) => g.pages);
    for (const id of ["pos", "qrcodes"]) expect(fair, id).toContain(STOCKROOM_ITEM_PREFIX + id);
  });

  it("splits the menu in two sides, website and stockroom, each named by the job", () => {
    expect(WEBSITE_SIDE.map((g) => g.label)).toEqual(["Home", "Orders", "Messages", "Books", "Marketing", "Analytics", "Online store", "Settings"]);
    expect(STOCKROOM_SIDE.map((g) => g.label)).toEqual(["Inventory", "Sales", "Stockists", "Invoices", "Tax centre", "Bookkeeping", "Backups"]);
    expect(FAIR_MENU.map((g) => g.label)).toEqual(["Till", "Record a sale", "QR codes", "Today's sales", "Stock check"]);
    // v4: the Google Sheet is Settings › Google's "Sales spreadsheet", on the website side.
    for (const p of STOCKROOM_PAGES) expect(sideOf(STOCKROOM_ITEM_PREFIX + p.id), p.id).toBe(p.id === "sheets" ? "website" : "stockroom");
    expect(sideOf("overview")).toBe("website");
    expect(sideOf("orders")).toBe("website");
    expect(sideOf("inventory")).toBe("stockroom");
    expect(sideMenu("stockroom")[0].pages[0]).toBe(STOCKROOM_ITEM_PREFIX + "dashboard");
  });

  it("gives each page a label", () => {
    for (const item of sidebarItems(NAV, COMBINED_MENU)) {
      for (const child of item.children || []) expect(child.label, child.id).not.toBe(child.id);
    }
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "pos", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "pos");
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "taxcenter", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "taxcenter");
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "consignment", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "consignment");
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "reconcile", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "taxcenter");
    expect(menuItemFor("customers", COMBINED_MENU)).toBe("orders");
    expect(menuItemFor("channels", COMBINED_MENU)).toBe("discounts");
  });

  it("speaks the shop's words: Products for a shop that sells clothing, Books for a press", () => {
    const labels = (answer: string) => sidebarItems(NAV, COMBINED_MENU).map((item) => adminWordsFor(answer)(item.label));
    expect(labels("clothing")).toContain("Products");
    expect(labels("clothing")).not.toContain("Books");
    expect(labels("books")).toContain("Books");
  });

  it("keeps every Settings page in both menus, so a new one (billing) shows in the combined admin too", () => {
    const settings = (menu: typeof MENU) => menu.find((g) => g.label === "Settings")?.pages;
    const combined = COMBINED_MENU.flatMap((g) => g.pages);
    expect(combined).toEqual(expect.arrayContaining(settings(MENU) || []));
    const navSettings = NAV.find((n) => n.id === "settings")?.children?.map((c) => "settings/" + c.id).filter((id) => id !== "settings/designer");
    expect(settings(MENU)).toEqual(navSettings);
  });

  it("draws every stockroom page itself, so the old stockroom app never runs behind the admin", () => {
    for (const p of STOCKROOM_PAGES) expect(NATIVE_PAGES[p.id], p.id).toBeTruthy();
    expect(stockroomPage("website")).toBeUndefined();
    expect(stockroomPage("pos")?.label).toBe("Till");
  });

  it("gives each stockroom page its own address and Back step", () => {
    expect(routeFromHash("#stockroom/pos")).toEqual({ tab: STOCKROOM_TAB, subTab: "pos" });
    expect(routeFromHash("#stockroom/nope")).toEqual({ tab: STOCKROOM_TAB, subTab: DEFAULT_STOCKROOM_PAGE });
    expect(routeFromHash("#stockroom")).toEqual({ tab: STOCKROOM_TAB, subTab: DEFAULT_STOCKROOM_PAGE });
    for (const p of STOCKROOM_PAGES) expect(routeFromHash(hashForRoute({ tab: STOCKROOM_TAB, subTab: p.id }))).toEqual({ tab: STOCKROOM_TAB, subTab: p.id });
    expect(sameSection("#stockroom/pos", "#stockroom/expenses")).toBe(false);
    expect(sameSection("#stockroom/pos", "#stockroom/pos")).toBe(true);
    // A shop with only the website: a stockroom address is unknown, as before.
    expect(routeFromHash("#stockroom/pos", false)).toBeNull();
  });

  it("is served from the shop's own address, so one sign-in covers both", () => {
    const hosting = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "firebase.json"), "utf8")).hosting;
    const rule = hosting.rewrites.find((r: { regex: string }) => new RegExp(r.regex).test("/stockroom/app"));
    expect(rule?.destination).toBe("/stockroom/index.html");
    const lib = readFileSync(join(stockroomRoot, "src/lib/inside-admin.js"), "utf8");
    expect(lib).toContain("INSIDE_ADMIN_PATH = '/stockroom/app'");
  });
});
