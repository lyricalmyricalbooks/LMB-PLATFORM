import { describe, expect, it } from "vitest";
import {
  BOTH_BY_BOOKINGS_COMBINED, BOTH_BY_BOOKINGS_MENU, BOTH_BY_BOOKINGS_SIDE, BOTH_BY_PRODUCTS_COMBINED, BOTH_BY_PRODUCTS_MENU,
  BOTH_BY_PRODUCTS_SIDE, COMBINED_MENU, MENU, NAV, STOCKROOM_SIDE, adminMenu, navPages, sideMenu, sidebarItems,
} from "./riso/nav";

// Shop types plan, part 2: a shop doing both gets products and bookings in one admin, led by what most customers come for.
const pages = (menu: typeof MENU) => menu.flatMap((item) => item.pages);

describe("the menu of a shop that does both", () => {
  it("lists every page of the product shop's menu exactly once, nothing it doesn't know", () => {
    for (const [both, shop] of [[BOTH_BY_BOOKINGS_COMBINED, COMBINED_MENU], [BOTH_BY_PRODUCTS_COMBINED, COMBINED_MENU], [BOTH_BY_BOOKINGS_MENU, MENU], [BOTH_BY_PRODUCTS_MENU, MENU]] as const) {
      const list = pages(both);
      expect(new Set(list).size).toBe(list.length);
      expect([...list].sort()).toEqual([...pages(shop)].sort());
    }
    const titled = new Set(navPages(NAV).map((p) => p.id));
    for (const item of sidebarItems(NAV, BOTH_BY_BOOKINGS_COMBINED)) expect(titled.has(item.id) || item.id.startsWith("stockroom/"), item.id).toBe(true);
  });

  it("puts Calendar first for a shop people book with, and Orders and products first for one they buy from", () => {
    expect(BOTH_BY_BOOKINGS_SIDE.map((i) => i.label).slice(0, 3)).toEqual(["Home", "Calendar", "Clients"]);
    expect(BOTH_BY_PRODUCTS_SIDE.map((i) => i.label).slice(0, 5)).toEqual(["Home", "Orders", "Messages", "Books", "Calendar"]);
    expect(BOTH_BY_BOOKINGS_MENU[1].label).toBe("Calendar");
    expect(BOTH_BY_PRODUCTS_MENU[1].label).toBe("Orders");
    // Shipping stays: the shop sends products.
    expect(pages(BOTH_BY_BOOKINGS_SIDE)).toContain("settings/shipping");
  });

  it("is picked by kind and lead, and keeps the stockroom side with its stock", () => {
    expect(adminMenu(true, "both")).toBe(BOTH_BY_BOOKINGS_COMBINED);
    expect(adminMenu(true, "both", "products")).toBe(BOTH_BY_PRODUCTS_COMBINED);
    expect(adminMenu(false, "both", "services")).toBe(BOTH_BY_BOOKINGS_MENU);
    expect(sideMenu("website", "both", "products")).toBe(BOTH_BY_PRODUCTS_SIDE);
    expect(sideMenu("stockroom", "both")).toBe(STOCKROOM_SIDE);
    expect(adminMenu(true, "shop", "products")).toBe(COMBINED_MENU);
  });
});
