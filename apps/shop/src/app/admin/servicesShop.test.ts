// A services shop (a salon, a studio, a tutor): its own menu, its own words, and the same pages underneath.
import { describe, expect, it } from "vitest";
import { ADMIN_TABS } from "./adminRoute";
import { COMBINED_MENU, MENU, NAV, SERVICES_COMBINED_MENU, SERVICES_MENU, SERVICES_MONEY_SIDE, SERVICES_WEBSITE_SIDE, adminMenu, navPages, sideMenu, sidebarItems } from "./riso/nav";
import { SELLS, sellsBooks, sellsServices, shopKind, wordsFor } from "../../shared/shopSells";
import { kindSwitchQuestion, sellsChoicesFor, sellsGroupsFor } from "./WhatYouSellCard";
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
    // What clients do keeps its word; only the thing a shop sells is reworded.
    expect(w("Clients can't book online yet. Add a book.")).toBe("Clients can't book online yet. Add a product.");
    expect(w("Your website shows Book a time.")).toBe("Your website shows Book a time.");
    expect(w("1 service ready to book")).toBe("1 service ready to book");
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

  it("offers both kinds only where the shop may switch, and asks before a switch of kind", () => {
    expect(sellsGroupsFor(false, false)).toHaveLength(1);
    expect(sellsGroupsFor(false, false)[0].choices.some((c) => SERVICE_IDS.includes(c.id))).toBe(false);
    const both = sellsGroupsFor(false, true);
    expect(both.map((g) => g.label)).toEqual(["Services", "Products"]);
    expect(both[0].choices.map((c) => c.id)).toEqual(SERVICE_IDS);
    expect(kindSwitchQuestion("books", "zines")).toBeNull();
    expect(kindSwitchQuestion("hair", "fitness")).toBeNull();
    expect(kindSwitchQuestion("books", "hair")?.confirmLabel).toBe("Switch to services");
    expect(kindSwitchQuestion("hair", "books")?.confirmLabel).toBe("Switch to products");
    expect(kindSwitchQuestion(null, "hair")?.title).toBe("Switch to a services shop?");
  });
});

// ── Setting up: a services shop is asked for services and hours, never for products, shipping or a practice order. ──
import { firstWeekIntro, firstWeekSteps, openBlockers } from "./firstWeek";
import { launchReadiness } from "./launchReadiness";
import { nextRunStep, runSteps } from "./startRun";
import { readBookingsFacts } from "./launchCheck";
import { bookable, hasHours, servicesOnly, type BookingsFacts } from "./servicesSetup";
import { DEFAULT_BOOKING_SETTINGS, type BookingService } from "../../shared/bookingTimes";

const cut: BookingService = { id: "cut", name: "Cut", description: "", minutes: 45, gapAfter: 0, priceMinor: 6000, payment: "full", location: "", active: true, order: 0, questions: [] };
const openDay = [{ start: "10:00", end: "18:00" }];
const hours = (live: boolean) => ({ ...DEFAULT_BOOKING_SETTINGS, live, hours: [[], openDay, openDay, openDay, openDay, openDay, []] });
const salonReady: BookingsFacts = { services: [cut], settings: hours(true) };
const salonEmpty: BookingsFacts = { services: [], settings: { ...DEFAULT_BOOKING_SETTINGS, live: false, hours: [[], [], [], [], [], [], []] } };
const policies = { shipping: "", returns: "", privacy: "We keep your details private.", terms: "Our terms." };
const settings = { policies, location: { street: "1 Example St", city: "Toronto", country: "Canada" }, design: { showUnderConstruction: true } };
const readiness = (bookings?: BookingsFacts | null) => launchReadiness({ settings, books: [], shippingProfiles: [], emailLog: [], orders: [], platformCards: "stripe", platformAccount: null, bookings });

describe("setting up a services shop", () => {
  it("knows a services shop that sells no products", () => {
    expect(servicesOnly({ publishes: "hair" })).toBe(true);
    expect(servicesOnly({ publishes: "clothing", sells: "lessons" })).toBe(true);
    expect(servicesOnly({ publishes: "hair", sellsProducts: true })).toBe(false);
    expect(servicesOnly({ publishes: "zines" })).toBe(false);
    expect(servicesOnly(null)).toBe(false);
    expect(bookable({ ...salonReady, services: [cut, { ...cut, id: "old", active: false }] })).toHaveLength(1);
    expect(hasHours(salonReady)).toBe(true);
    expect(hasHours(salonEmpty)).toBe(false);
  });

  it("checks services, hours and the booking page before opening, not products or shipping", () => {
    const ids = readiness(salonEmpty).map(i => i.id);
    for (const gone of ["books", "shipping", "catalog-metadata", "catalog-test-content", "first-sale"]) expect(ids).not.toContain(gone);
    expect(openBlockers(readiness(salonEmpty)).map(i => i.id)).toEqual(expect.arrayContaining(["services", "booking-hours", "booking-page"]));
    const ready = readiness(salonReady);
    for (const id of ["services", "booking-hours", "booking-page", "policies"]) expect(ready.find(i => i.id === id)?.status, id).toBe("ok");
    expect(ready.find(i => i.id === "services")).toMatchObject({ label: "1 service ready to book", tab: "bookings" });
    expect(readiness(null).find(i => i.id === "services")?.status).toBe("warn");
  });

  it("leaves every other shop's checks as they were", () => {
    const ids = readiness(undefined).map(i => i.id);
    for (const kept of ["books", "shipping", "first-sale"]) expect(ids).toContain(kept);
    expect(ids).not.toContain("services");
    // A product shop still needs all four policies.
    expect(readiness(undefined).find(i => i.id === "policies")?.status).toBe("block");
  });

  it("walks Get started without the products and shipping steps", () => {
    expect(runSteps("stripe", true)).toEqual(["details", "services", "look", "payments", "final"]);
    expect(runSteps(null, true)).toEqual(["details", "services", "look", "final"]);
    expect(runSteps("stripe")).toEqual(["details", "bring", "look", "payments", "shipping", "final"]);
    const at = { at: "2026-11-14T10:00:00.000Z" };
    const salon = { publishes: "hair", details: at };
    expect(nextRunStep(salon, settings, null)).toBe("services");
    expect(nextRunStep({ ...salon, bring: at }, settings, null)).toBe("look");
    expect(nextRunStep({ ...salon, bring: at, welcome: at }, settings, null)).toBe("final");
    expect(nextRunStep({ ...salon, bring: at, welcome: at, finalCheck: at }, settings, null)).toBeNull();
    // A product shop, and a services shop that sells products too, keep the products and shipping steps.
    expect(nextRunStep({ publishes: "clothing", details: at }, settings, null)).toBe("bring");
    expect(nextRunStep({ publishes: "hair", sellsProducts: true, details: at, bring: at, welcome: at }, settings, null)).toBe("shipping");
  });

  it("gets a setup guide from the first service to the first booking", () => {
    const doc = { publishes: "hair", sellingToday: "online" };
    const steps = firstWeekSteps(doc, { books: [], readiness: readiness(salonEmpty), settings, bookings: salonEmpty });
    expect(steps.map(s => s.id)).toEqual(["add-services", "hours", "logo", "look", "taxes", "payments", "policies", "booking-page", "address", "open", "google"]);
    expect(steps.slice(0, 2).every(s => s.tab === "bookings" && !s.done)).toBe(true);
    const words = steps.map(s => `${s.title} ${s.why}`).join(" ");
    expect(words).not.toMatch(/shipping|shoppers|a book\b|Shopping|practice order|product/i);
    expect(firstWeekIntro(doc)).toMatch(/first service to your first booking/);
    const done = firstWeekSteps(doc, { books: [], readiness: readiness(salonReady), settings, bookings: salonReady });
    for (const id of ["add-services", "hours", "booking-page", "policies"]) expect(done.find(s => s.id === id)?.done, id).toBe(true);
    // Selling products too brings the product shop's guide back.
    expect(firstWeekSteps({ ...doc, sellsProducts: true }, { books: [], readiness: [] }).map(s => s.id)).toContain("shipping");
  });

  it("reads Bookings only for a services shop", async () => {
    let reads = 0;
    const setup = async () => { reads++; return salonReady; };
    expect(await readBookingsFacts({ getFirstWeek: async () => ({ publishes: "zines" }) } as never, setup)).toBeUndefined();
    expect(await readBookingsFacts({ getFirstWeek: async () => { throw new Error("offline"); } } as never, setup)).toBeUndefined();
    expect(reads).toBe(0);
    expect(await readBookingsFacts({ getFirstWeek: async () => ({ publishes: "hair" }) } as never, setup)).toEqual(salonReady);
    expect(await readBookingsFacts({ getFirstWeek: async () => ({ publishes: "hair" }) } as never, async () => { throw new Error("offline"); })).toBeNull();
  });
});
