import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_STOCKROOM_PAGE, FROM_ADMIN, FROM_STOCKROOM, STOCKROOM_ITEM_PREFIX, STOCKROOM_PAGES, STOCKROOM_TAB,
  combinedAdmin, lookMessage, openMessage, stockroomFrameMessage, stockroomPage,
} from "./combined";
import { COMBINED_MENU, MENU, NAV, STOCKROOM_SIDE, WEBSITE_SIDE, menuItemFor, sideMenu, sideOf, sidebarItems } from "./riso/nav";
import { hashForRoute, routeFromHash, sameSection } from "./adminRoute";
import { DEFAULT_SHOP_PROFILE } from "../../lib/shopProfile";
import { adminWordsFor } from "./sells";

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
    for (const p of STOCKROOM_PAGES) expect(pages.filter((id) => id === STOCKROOM_ITEM_PREFIX + p.id), p.id).toHaveLength(1);
  });

  it("splits the menu in two sides, website and stockroom, each named by the job", () => {
    expect(WEBSITE_SIDE.map((g) => g.label)).toEqual(["Home", "Orders", "Books", "Marketing", "Online store", "Settings"]);
    expect(STOCKROOM_SIDE.map((g) => g.label)).toEqual(["To-do", "Stock", "Sales", "Sell in person", "Money", "Open call", "Stockroom settings"]);
    for (const p of STOCKROOM_PAGES) expect(sideOf(STOCKROOM_ITEM_PREFIX + p.id), p.id).toBe("stockroom");
    expect(sideOf("overview")).toBe("website");
    expect(sideOf("orders")).toBe("website");
    expect(sideOf("inventory")).toBe("stockroom");
    expect(sideMenu("stockroom")[0].pages[0]).toBe(STOCKROOM_ITEM_PREFIX + "todo");
  });

  it("gives each page a label", () => {
    for (const item of sidebarItems(NAV, COMBINED_MENU)) {
      for (const child of item.children || []) expect(child.label, child.id).not.toBe(child.id);
    }
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "pos", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "pos");
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "taxcenter", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "taxcenter");
    expect(menuItemFor(STOCKROOM_ITEM_PREFIX + "consignment", COMBINED_MENU)).toBe(STOCKROOM_ITEM_PREFIX + "pos");
    expect(menuItemFor("customers", COMBINED_MENU)).toBe("orders");
  });

  it("speaks the shop's words: Products for a shop that sells clothing, Books for a press", () => {
    const labels = (answer: string) => sidebarItems(NAV, COMBINED_MENU).map((item) => adminWordsFor(answer)(item.label));
    expect(labels("clothing")).toContain("Products");
    expect(labels("clothing")).not.toContain("Books");
    expect(labels("books")).toContain("Books");
  });

  it("keeps every Settings page in both menus, so a new one (billing) shows in the combined admin too", () => {
    const settings = (menu: typeof MENU) => menu.find((g) => g.label === "Settings")?.pages;
    expect(settings(COMBINED_MENU)).toEqual(expect.arrayContaining(settings(MENU) || []));
    const navSettings = NAV.find((n) => n.id === "settings")?.children?.map((c) => "settings/" + c.id).filter((id) => id !== "settings/designer");
    expect(settings(MENU)).toEqual(navSettings);
  });

  it("names only stockroom pages that exist, by the stockroom's own tab names", () => {
    const html = readFileSync(join(stockroomRoot, "index.html"), "utf8");
    for (const p of STOCKROOM_PAGES) expect(html, p.id).toContain(`id="tab-${p.id}"`);
    expect(stockroomPage("website")).toBeUndefined();
    expect(stockroomPage("pos")?.label).toBe("Fair till");
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

  it("talks with the stockroom frame only, in names both sides share", () => {
    const frame = {};
    const origin = "https://lmb-test-shop.web.app";
    const ev = (data: unknown, over: object = {}) => ({ source: frame, origin, data, ...over });
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "ready" }), frame, origin)).toEqual({ type: "ready" });
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "page", tab: "pos" }), frame, origin)).toEqual({ type: "page", tab: "pos" });
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "page", tab: "website" }), frame, origin)).toEqual({ type: "page", tab: "website" });
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "page", tab: "../x" }), frame, origin)).toBeNull();
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "ready" }, { source: {} }), frame, origin)).toBeNull();
    expect(stockroomFrameMessage(ev({ source: FROM_STOCKROOM, type: "ready" }, { origin: "https://elsewhere.example" }), frame, origin)).toBeNull();
    expect(openMessage("pos")).toEqual({ source: FROM_ADMIN, type: "open", tab: "pos" });
    expect(lookMessage("paper", "dark")).toEqual({ source: FROM_ADMIN, type: "look", look: "paper", appearance: "dark" });
    const lib = readFileSync(join(stockroomRoot, "src/lib/inside-admin.js"), "utf8");
    expect(lib).toContain(`FROM_ADMIN = '${FROM_ADMIN}'`);
    expect(lib).toContain(`FROM_STOCKROOM = '${FROM_STOCKROOM}'`);
  });

  it("is served from the shop's own address, so one sign-in covers both", () => {
    const hosting = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "firebase.json"), "utf8")).hosting;
    const rule = hosting.rewrites.find((r: { regex: string }) => new RegExp(r.regex).test("/stockroom/app"));
    expect(rule?.destination).toBe("/stockroom/index.html");
    const lib = readFileSync(join(stockroomRoot, "src/lib/inside-admin.js"), "utf8");
    expect(lib).toContain("INSIDE_ADMIN_PATH = '/stockroom/app'");
  });
});
