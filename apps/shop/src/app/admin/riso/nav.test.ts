import { describe, expect, it } from "vitest";
import { NAV, PAGE_COPY, SETTINGS_ITEM_PREFIX, sidebarItems } from "./nav";

describe("admin navigation", () => {
  it("lists the primary modules in order", () => {
    expect(NAV.map((n) => n.id)).toEqual(["overview", "orders", "customers", "inventory", "catalog", "discounts", "giftCards", "reviews", "messages", "settings"]);
  });

  it("has unique ids across modules and settings children", () => {
    const ids = [...NAV.map((n) => n.id), ...NAV.flatMap((n) => (n.children || []).map((c) => `settings-${c.id}`))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps nested Settings navigation (general, shipping, payments, taxes, design, notifications, email sender)", () => {
    const settings = NAV.find((n) => n.id === "settings");
    expect(settings?.children?.map((c) => c.id)).toEqual(["general", "shipping", "payments", "taxes", "designer", "notifications"]);
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

describe('sidebar items', () => {
  const items = sidebarItems(NAV);
  const settings = NAV.find(n => n.id === 'settings')!;

  it('puts every Settings page in the main list, in order, under one Settings heading', () => {
    const flat = items.filter(i => i.id.startsWith(SETTINGS_ITEM_PREFIX));
    expect(flat.map(i => i.id)).toEqual(settings.children!.map(c => SETTINGS_ITEM_PREFIX + c.id));
    expect(flat.map(i => i.label)).toEqual(settings.children!.map(c => c.label));
    expect(flat.filter(i => i.section).map(i => i.section)).toEqual(['Settings']);
    expect(flat[0].section).toBe('Settings');
  });

  it('has no fold-out entries left and keeps every other page, each with an icon', () => {
    expect(items.some(i => i.children)).toBe(false);
    expect(items.some(i => i.id === 'settings')).toBe(false);
    for (const n of NAV.filter(n => !n.children)) expect(items.map(i => i.id)).toContain(n.id);
    for (const i of items) expect(typeof i.icon === 'function' || typeof i.icon === 'object').toBe(true);
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
});
