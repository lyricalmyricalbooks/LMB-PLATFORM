import { describe, expect, it } from "vitest";
import { ADMIN_TABS, SETTINGS_TABS, SUB_TABS, adminDocumentTitle, hashForRoute, keepsSubTab, routeFromHash, sameSection, settingsPageOf, searchFromHash, subTabPage } from "./adminRoute";

describe("admin route ↔ hash", () => {
  it("round-trips every page", () => {
    for (const tab of ADMIN_TABS.filter((t) => t !== "settings")) {
      expect(routeFromHash(hashForRoute({ tab }))).toEqual({ tab });
    }
    for (const settingsTab of SETTINGS_TABS.filter((t) => t !== "designer" && t !== "communications")) {
      expect(routeFromHash(hashForRoute({ tab: "settings", settingsTab }))).toEqual({ tab: "settings", settingsTab: settingsPageOf(settingsTab) });
    }
    // Email sender was merged into the one email page: its old address still opens it, on Sending setup.
    expect(routeFromHash("#settings/communications")).toEqual({ tab: "settings", settingsTab: "notifications", subTab: "email-setup" });
    expect(hashForRoute({ tab: "settings", settingsTab: "communications" })).toBe("#settings/notifications/setup");
    expect(hashForRoute({ tab: "settings", settingsTab: "communications", subTab: "email-deliveries" })).toBe("#settings/notifications/deliveries");
    expect(hashForRoute({ tab: "settings", settingsTab: "communications", subTab: "email-templates" })).toBe("#settings/notifications");
  });

  it("keeps the existing email and gift-card links working", () => {
    expect(routeFromHash("#orders")).toEqual({ tab: "orders" });
    expect(routeFromHash("#orders/abc%2F12")).toEqual({ tab: "orders", orderId: "abc/12" });
    expect(routeFromHash("#gift-cards/card1")).toEqual({ tab: "giftCards", giftCardId: "card1" });
    expect(hashForRoute({ tab: "orders", orderId: "abc/12" })).toBe("#orders/abc%2F12");
  });

  it("leaves Studio links and unknown hashes alone", () => {
    expect(routeFromHash("#designer?t=productPage")).toBeNull();
    expect(routeFromHash("#nope")).toBeNull();
    expect(routeFromHash("")).toBeNull();
    expect(hashForRoute({ tab: "settings", settingsTab: "designer" })).toBe("#designer");
  });

  it("treats Shipping/Payments as Settings pages and falls back to General", () => {
    expect(hashForRoute({ tab: "shipping" })).toBe("#settings/shipping");
    expect(routeFromHash("#payments")).toEqual({ tab: "settings", settingsTab: "payments" });
    expect(routeFromHash("#settings/unknown")).toEqual({ tab: "settings", settingsTab: "general" });
    expect(routeFromHash("#settings/designer")).toEqual({ tab: "settings", settingsTab: "general" });
  });

  it("round-trips every sub tab with a readable slug, the default tab with none", () => {
    for (const [page, tabs] of Object.entries(SUB_TABS)) {
      const base = page === "inventory" ? { tab: "inventory" } : { tab: "settings", settingsTab: page };
      tabs.forEach(([slug, id], i) => {
        const hash = hashForRoute({ ...base, subTab: id });
        expect(hash.endsWith(i === 0 ? page : `/${slug}`)).toBe(true);
        expect(routeFromHash(hash)).toEqual(i === 0 ? base : { ...base, subTab: id });
        expect(subTabPage(base)).toBe(page);
      });
    }
    expect(routeFromHash("#settings/general/visitors")).toEqual({ tab: "settings", settingsTab: "general", subTab: "gs-visitors" });
    expect(routeFromHash("#settings/payments/methods")).toEqual({ tab: "settings", settingsTab: "payments", subTab: "pay-methods" });
    expect(routeFromHash("#settings/notifications/deliveries")).toEqual({ tab: "settings", settingsTab: "notifications", subTab: "email-deliveries" });
    expect(routeFromHash("#inventory/link")).toEqual({ tab: "inventory", subTab: "inv-link" });
    expect(routeFromHash("#payments/methods")).toEqual({ tab: "settings", settingsTab: "payments", subTab: "pay-methods" });
    expect(hashForRoute({ tab: "payments", subTab: "pay-more" })).toBe("#settings/payments/more");
    expect(hashForRoute({ tab: "shipping", subTab: "carrier" })).toBe("#settings/shipping/carrier");
  });

  it("opens the default sub tab for unknown slugs and pages without sub tabs", () => {
    expect(routeFromHash("#settings/general/nope")).toEqual({ tab: "settings", settingsTab: "general" });
    expect(routeFromHash("#settings/general/store")).toEqual({ tab: "settings", settingsTab: "general" });
    expect(routeFromHash("#inventory/nope")).toEqual({ tab: "inventory" });
    expect(routeFromHash("#settings/taxes/visitors")).toEqual({ tab: "settings", settingsTab: "taxes" });
    expect(routeFromHash("#customers/link")).toEqual({ tab: "customers" });
    expect(hashForRoute({ tab: "settings", settingsTab: "general", subTab: "pay-methods" })).toBe("#settings/general");
    expect(hashForRoute({ tab: "customers", subTab: "inv-link" })).toBe("#customers");
  });

  it("only treats a different order on the same page as the same section", () => {
    expect(sameSection("#orders", "#orders/a")).toBe(true);
    expect(sameSection("#orders/a", "#orders/b")).toBe(true);
    expect(sameSection("#orders", "#customers")).toBe(false);
    expect(sameSection("#settings/general", "#settings/payments")).toBe(false);
    // Switching a sub tab replaces the address too.
    expect(sameSection("#settings/general", "#settings/general/visitors")).toBe(true);
    expect(sameSection("#inventory/link", "#inventory")).toBe(true);
    expect(sameSection("#settings/general/visitors", "#settings/payments/methods")).toBe(false);
    expect(sameSection("#inventory/link", "#customers")).toBe(false);
  });

  it("names the browser tab after the page", () => {
    expect(adminDocumentTitle("Orders")).toBe("Orders · Lyricalmyrical admin");
  });
  it("keeps the Overview's own sub tab in the address", () => {
    expect(routeFromHash("#overview/visitors/move")).toEqual({ tab: "overview" });
    expect(keepsSubTab("#overview/visitors/move", "#overview")).toBe(true);
    expect(keepsSubTab("#overview", "#overview")).toBe(false);
    expect(keepsSubTab("#overview/visitors", "#orders")).toBe(false);
  });
});

describe("links from the inventory app's search", () => {
  it("opens a book in the editor, and only a plausible book id", () => {
    expect(routeFromHash("#catalog/book/abc123")).toEqual({ tab: "catalog", bookId: "abc123" });
    expect(routeFromHash("#catalog/book/a%20b")).toEqual({ tab: "catalog" });
    expect(routeFromHash("#catalog/book/")).toEqual({ tab: "catalog" });
    // The address written back afterwards is the plain Books page, so a reload doesn't reopen the editor.
    expect(hashForRoute({ tab: "catalog", bookId: "abc123" })).toBe("#catalog");
  });
  it("reads the text to search for, tidied and at most 100 characters", () => {
    expect(searchFromHash("#search=Moth%20%20Hours")).toBe("Moth Hours");
    expect(searchFromHash("search=x".padEnd(200, "y"))!.length).toBe(100);
    expect(searchFromHash("#search=")).toBeNull();
    expect(searchFromHash("#searching")).toBeNull();
    expect(searchFromHash("#orders")).toBeNull();
    expect(routeFromHash("#search=moth")).toBeNull();
  });
});
