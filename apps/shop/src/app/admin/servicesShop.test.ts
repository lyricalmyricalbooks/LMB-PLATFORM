// A services shop (a salon, a studio, a tutor): its own menu, its own words, and the same pages underneath.
import { describe, expect, it } from "vitest";
import { ADMIN_TABS } from "./adminRoute";
import { COMBINED_MENU, MENU, NAV, SERVICES_COMBINED_MENU, SERVICES_MENU, SERVICES_MONEY_SIDE, SERVICES_WEBSITE_SIDE, adminMenu, navPages, sideMenu, sidebarItems } from "./riso/nav";
import { SELLS, sellsBooks, sellsServices, shopKind, wordsFor } from "../../shared/shopSells";
import { sellsChoicesFor } from "./WhatYouSellCard";
import { startingKind } from "./sells";

const SERVICE_IDS = ["hair", "wellness", "lessons", "fitness", "studio", "services"];

describe("services shops", () => {
  it("knows the service answers, and files every answer under one kind of shop", () => {
    for (const id of SERVICE_IDS) {
      expect(SELLS).toContain(id);
      expect(sellsServices(id)).toBe(true);
      expect(sellsBooks(id)).toBe(false);
      expect(shopKind(id)).toBe("services");
    }
    expect(shopKind("zines")).toBe("books");
    expect(shopKind("clothing")).toBe("products");
    expect(shopKind(null)).toBe("books");
    expect(sellsServices(null)).toBe(false);
  });

  it("says clients, not customers or shoppers", () => {
    const w = wordsFor("hair");
    expect(w("Customers")).toBe("Clients");
    expect(w("Email your customer")).toBe("Email your client");
    expect(wordsFor("clothing")("Customers")).toBe("Customers");
    expect(wordsFor("books")("Customers")).toBe("Customers");
  });

  it("gets a menu built around the calendar, with no product, stock or shipping pages", () => {
    for (const menu of [SERVICES_MENU, SERVICES_COMBINED_MENU]) {
      const pages = menu.flatMap((item) => item.pages);
      expect(new Set(pages).size).toBe(pages.length);
      expect(menu[0].pages[0]).toBe("overview");
      expect(menu[1]).toMatchObject({ label: "Calendar", pages: ["bookings"] });
      for (const gone of ["catalog", "inventory", "channels", "settings/shipping"]) expect(pages).not.toContain(gone);
      expect(pages).toContain("customers");
      expect(pages).toContain("settings/payments");
    }
  });

  it("only lists pages the shop menu already has, so every one opens", () => {
    const known = (menu: typeof MENU) => new Set(menu.flatMap((item) => item.pages));
    for (const page of SERVICES_MENU.flatMap((item) => item.pages)) expect(known(MENU).has(page) || ADMIN_TABS.includes(page.split("/")[0] as never), page).toBe(true);
    for (const page of SERVICES_COMBINED_MENU.flatMap((item) => item.pages)) expect(known(COMBINED_MENU).has(page) || ADMIN_TABS.includes(page.split("/")[0] as never), page).toBe(true);
    const titled = new Set(navPages(NAV).map((p) => p.id));
    for (const item of sidebarItems(NAV, SERVICES_COMBINED_MENU)) expect(titled.has(item.id) || item.id.startsWith("stockroom/"), item.id).toBe(true);
  });

  it("picks the menu by kind, and leaves every other shop's menu alone", () => {
    expect(adminMenu(false)).toBe(MENU);
    expect(adminMenu(true)).toBe(COMBINED_MENU);
    expect(adminMenu(false, "services")).toBe(SERVICES_MENU);
    expect(adminMenu(true, "services")).toBe(SERVICES_COMBINED_MENU);
    expect(sideMenu("website", "services")).toBe(SERVICES_WEBSITE_SIDE);
    expect(sideMenu("stockroom", "services")).toBe(SERVICES_MONEY_SIDE);
  });

  it("offers a services shop the service choices in Settings, and a product shop the product ones", () => {
    expect(sellsChoicesFor(true).map((c) => c.id)).toEqual(SERVICE_IDS);
    expect(sellsChoicesFor(false).some((c) => SERVICE_IDS.includes(c.id))).toBe(false);
    expect(startingKind("hair")).toBe("other");
  });
});
