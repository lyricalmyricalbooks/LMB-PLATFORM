import { describe, expect, it } from "vitest";
import { MENU, NAV, PAGE_COPY, SETTINGS_ITEM_PREFIX, menuItemFor, navPages, sidebarItems, withoutPages } from "./nav";

describe("admin navigation", () => {
  it("lists the primary modules in order", () => {
    expect(NAV.map((n) => n.id)).toEqual(["overview", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "channels", "socialPosts", "settings"]);
  });

  it("has unique ids across modules and settings children", () => {
    const ids = [...NAV.map((n) => n.id), ...NAV.flatMap((n) => (n.children || []).map((c) => `settings-${c.id}`))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps nested Settings navigation (general, shipping, payments, taxes, design, notifications, email sender, team)", () => {
    const settings = NAV.find((n) => n.id === "settings");
    expect(settings?.children?.map((c) => c.id)).toEqual(["general", "shipping", "payments", "taxes", "designer", "notifications", "google", "apps", "team", "security", "bookkeeping", "plan", "billing"]);
    // Notifications and Email sender are one page, listed once as "Email sender".
    expect(settings?.children?.find((c) => c.id === "notifications")?.label).toBe("Email sender");
  });

  it("has a title and description for every module", () => {
    for (const n of NAV) {
      expect(PAGE_COPY[n.id]?.title, n.id).toBeTruthy();
      expect(PAGE_COPY[n.id]?.description, n.id).toBeTruthy();
    }
  });
});

describe("the five-item admin menu (plan 1.27)", () => {
  const items = sidebarItems(NAV);

  it("has five items: Home, Orders, Books, Design and Settings", () => {
    expect(items.map((i) => i.label)).toEqual(["Home", "Orders", "Books", "Design", "Settings"]);
    expect(MENU).toHaveLength(5);
    for (const i of items) expect(typeof i.icon === "function" || typeof i.icon === "object").toBe(true);
  });

  it("holds every admin page exactly once, and each item opens its first page", () => {
    const pages = MENU.flatMap((g) => g.pages);
    expect(new Set(pages).size).toBe(pages.length);
    expect([...pages].sort()).toEqual(navPages(NAV).map((p) => p.id).sort());
    for (const [i, g] of MENU.entries()) expect(items[i].id).toBe(g.pages[0]);
  });

  it("lists an item's pages under it with their own names", () => {
    const orders = items.find((i) => i.label === "Orders")!;
    expect(orders.children?.map((c) => c.label)).toEqual(["Orders", "Customers", "Discounts", "Gift cards", "Social posts", "Messages"]);
    expect(items.find((i) => i.label === "Books")!.children?.map((c) => c.label)).toEqual(["Books", "Inventory", "Reviews", "Sales channels"]);
    const settings = items.find((i) => i.label === "Settings")!;
    expect(settings.children?.map((c) => c.id)).toEqual(["general", "shipping", "payments", "taxes", "notifications", "google", "apps", "team", "security", "bookkeeping", "plan", "billing"].map((id) => SETTINGS_ITEM_PREFIX + id));
    expect(items.find((i) => i.label === "Design")!.children).toBeUndefined();
  });

  it("hides Bookkeeping unless the shop has it on, keeping the other Settings pages", () => {
    const hidden = withoutPages(items, new Set([SETTINGS_ITEM_PREFIX + "bookkeeping"]));
    const settings = hidden.find((i) => i.label === "Settings")!;
    expect(settings.children?.map((c) => c.id)).not.toContain(SETTINGS_ITEM_PREFIX + "bookkeeping");
    expect(settings.children).toHaveLength(11);
    expect(withoutPages(items, new Set())).toBe(items);
  });

  it("finds the item that holds a page", () => {
    expect(menuItemFor("customers")).toBe("orders");
    expect(menuItemFor("reviews")).toBe("catalog");
    expect(menuItemFor(SETTINGS_ITEM_PREFIX + "team")).toBe(SETTINGS_ITEM_PREFIX + "general");
    expect(menuItemFor(SETTINGS_ITEM_PREFIX + "designer")).toBe(SETTINGS_ITEM_PREFIX + "designer");
    expect(menuItemFor("overview")).toBe("overview");
  });
});

describe("Settings in groups (redesign)", () => {
  it("lists every Settings page but Design under exactly one heading", async () => {
    const { SETTINGS_SECTIONS } = await import("./nav");
    const listed = SETTINGS_SECTIONS.flatMap((g) => g.pages);
    const settings = sidebarItems(NAV).find((i) => i.label === "Settings")!;
    expect([...listed].sort()).toEqual(settings.children!.map((c) => c.id).sort());
    expect(SETTINGS_SECTIONS.map((g) => g.label)).toEqual(["Shop", "Selling", "Messages", "Connections", "Safety"]);
  });

  it("keeps a page that has no heading yet, and drops empty groups", async () => {
    const { settingsSections } = await import("./nav");
    const groups = settingsSections([{ id: SETTINGS_ITEM_PREFIX + "security", label: "Security" }, { id: SETTINGS_ITEM_PREFIX + "new", label: "New" }]);
    expect(groups).toEqual([{ label: "Safety", pages: [{ id: SETTINGS_ITEM_PREFIX + "security", label: "Security" }, { id: SETTINGS_ITEM_PREFIX + "new", label: "New" }] }]);
  });
});
