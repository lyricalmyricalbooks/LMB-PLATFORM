import { describe, expect, it } from "vitest";
import {
  bagPeeks, bookPageActions, brokenInside, eventCount, filtersUsed, missingDefinitions, missingPages, navLinks, readDepth, sourceState,
} from "./overviewVisitorEvents";

const books = [{ id: "b1", slug: "salt", title: "Salt" }];
const HOSTS = ["lyricalmyricalbooks.com"];

describe("sourceState", () => {
  it("tells an old server from unregistered parameters from an unanswered report from a ready one", () => {
    expect(sourceState({} as any, "navClicks")).toBe("needsUpdate");
    expect(sourceState({} as any, "notFound")).toBe("needsUpdate");
    expect(sourceState(undefined, "bagPeeks")).toBe("needsUpdate");
    expect(sourceState({ navClicks: null, refusedReports: ["navClicks"] } as any, "navClicks")).toBe("notRegistered");
    expect(sourceState({ navClicks: null } as any, "navClicks")).toBe("notAnswered");
    // A refused standard-dimension report isn't about Custom definitions.
    expect(sourceState({ notFound: null, refusedReports: ["notFound"] } as any, "notFound")).toBe("notAnswered");
    expect(sourceState({ navClicks: [] } as any, "navClicks")).toBe("ready");
  });
  it("data functions treat a null key as no data", () => {
    expect(navLinks({ navClicks: null } as any)).toBeNull();
    expect(missingPages({ notFound: null } as any, books, HOSTS)).toBeNull();
    expect(bagPeeks({ bagPeeks: null } as any, books)).toBeNull();
    expect(readDepth({ scrollDepth: null, pageTime: null } as any, books)).toBeNull();
    expect(eventCount({ newEvents: null } as any, "nav_click")).toBeNull();
  });
  it("names the parameters still to register, once each", () => {
    const report: any = { newEvents: [], navClicks: [], pdpActions: null, pdpTabs: null, refusedReports: ["pdpActions", "pdpTabs"] };
    expect(missingDefinitions(report, ["navClicks", "pdpActions", "pdpTabs"])).toEqual(["action", "tab"]);
    expect(missingDefinitions(report, ["navClicks"])).toEqual([]);
    expect(missingDefinitions({} as any, ["filters"])).toEqual([]);
  });
  it("counts one event, null on an old server", () => {
    expect(eventCount({ newEvents: [{ eventName: "nav_click", eventCount: 4 }] } as any, "nav_click")).toBe(4);
    expect(eventCount({ newEvents: [] } as any, "nav_click")).toBe(0);
    expect(eventCount({} as any, "nav_click")).toBeNull();
  });
});

describe("navLinks", () => {
  it("groups clicks per menu with plain menu names, dropping unset values", () => {
    const res = navLinks({ navClicks: [
      { "customEvent:menu": "header", "customEvent:link_text": "About", eventCount: 9 },
      { "customEvent:menu": "header", "customEvent:link_text": "Shop", eventCount: 4 },
      { "customEvent:menu": "footer", "customEvent:link_text": "Contact", eventCount: 11 },
      { "customEvent:menu": "(not set)", "customEvent:link_text": "x", eventCount: 50 },
    ] } as any)!;
    expect(res.menus.map(m => [m.label, m.count])).toEqual([["Header menu", 13], ["Footer", 11]]);
    expect(res.top).toMatchObject({ label: "Contact", menu: "Footer", count: 11 });
    expect(res.total).toBe(24);
  });
  it("is null with nothing recorded (never zero)", () => {
    expect(navLinks({ navClicks: [] } as any)).toBeNull();
    expect(navLinks({} as any)).toBeNull();
    expect(navLinks({ navClicks: [{ "customEvent:menu": "(not set)", "customEvent:link_text": "(not set)", eventCount: 3 }] } as any)).toBeNull();
  });
});

describe("bookPageActions", () => {
  it("adds up actions with one plain name, names the books and the tabs", () => {
    const res = bookPageActions({
      pdpActions: [
        { "customEvent:action": "photo", pagePath: "/books/salt", eventCount: 5 },
        { "customEvent:action": "gallery", pagePath: "/books/salt/", eventCount: 2 },
        { "customEvent:action": "tab", pagePath: "/books/salt", eventCount: 6 },
        { "customEvent:action": "share", pagePath: "/books/other", eventCount: 1 },
      ],
      pdpTabs: [{ "customEvent:tab": "details", eventCount: 4 }, { "customEvent:tab": "reviews", eventCount: 2 }, { "customEvent:tab": "(not set)", eventCount: 8 }],
    } as any, books)!;
    expect(res.actions.map(a => [a.label, a.count])).toEqual([["Looked at another photo", 7], ["Opened a tab", 6], ["Shared the book", 1]]);
    expect(res.actions[0].books).toEqual([{ path: "/books/salt", label: "Salt", count: 7 }]);
    expect(res.tabs).toEqual([{ key: "details", label: "Details", count: 4 }, { key: "reviews", label: "Reviews", count: 2 }]);
    expect(res.books[0]).toEqual({ path: "/books/salt", label: "Salt", count: 13 });
  });
  it("keeps working without the tab report", () => {
    const res = bookPageActions({ pdpActions: [{ "customEvent:action": "zoom", pagePath: "/books/salt", eventCount: 2 }] } as any, books)!;
    expect(res.tabs).toBeNull();
    expect(res.actions[0].label).toBe("Enlarged a photo");
    expect(bookPageActions({ pdpActions: [] } as any, books)).toBeNull();
  });
});

describe("missingPages", () => {
  const report: any = { notFound: [
    { pagePath: "/books/old-title", pageReferrer: "https://www.google.com/", eventCount: 6 },
    { pagePath: "/books/old-title", pageReferrer: "https://lyricalmyricalbooks.com/books/salt", eventCount: 2 },
    { pagePath: "/product/x?ref=1", pageReferrer: "", eventCount: 3 },
  ] };
  it("lists missing addresses with where people came from", () => {
    const res = missingPages(report, books, HOSTS)!;
    expect(res.pages.map(p => [p.path, p.count])).toEqual([["/books/old-title", 8], ["/product/x", 3]]);
    expect(res.pages[0].from.map(f => [f.label, f.kind, f.count])).toEqual([["google.com", "site", 6], ["Salt", "shop", 2]]);
    expect(res.pages[1].from[0]).toMatchObject({ label: "Typed in or bookmarked", kind: "none" });
    expect(brokenInside(res)).toBe(2);
  });
  it("is null with none", () => {
    expect(missingPages({ notFound: [] } as any, books, HOSTS)).toBeNull();
  });
});

describe("filtersUsed", () => {
  it("counts filters with their choices", () => {
    const res = filtersUsed({ filters: [
      { "customEvent:filter": "format", "customEvent:value": "paperback", eventCount: 5 },
      { "customEvent:filter": "format", "customEvent:value": "e-book", eventCount: 2 },
      { "customEvent:filter": "in_stock", "customEvent:value": "(not set)", eventCount: 3 },
    ] } as any)!;
    expect(res.filters.map(f => [f.label, f.count])).toEqual([["Format", 7], ["In stock only", 3]]);
    expect(res.filters[0].values.map(v => v.label)).toEqual(["Paperback", "E book"]);
    expect(res.filters[1].values).toEqual([]);
    expect(filtersUsed({ filters: [] } as any)).toBeNull();
  });
});

describe("bagPeeks", () => {
  it("overall share when checkout starts only on the checkout page", () => {
    const res = bagPeeks({ bagPeeks: [
      { pagePath: "/", eventName: "view_cart", eventCount: 12 },
      { pagePath: "/books/salt", eventName: "view_cart", eventCount: 8 },
      { pagePath: "/checkout", eventName: "begin_checkout", eventCount: 5 },
    ] } as any, books)!;
    expect(res.perPage).toBe(false);
    expect(res).toMatchObject({ peeks: 20, checkouts: 5, rate: 0.25 });
    expect(res.rows.map(r => [r.label, r.peeks, r.rate])).toEqual([["Home", 12, null], ["Salt", 8, null]]);
  });
  it("per-page share when checkout starts are recorded on the pages", () => {
    const res = bagPeeks({ bagPeeks: [
      { pagePath: "/", eventName: "view_cart", eventCount: 10 },
      { pagePath: "/", eventName: "begin_checkout", eventCount: 4 },
    ] } as any, books)!;
    expect(res.perPage).toBe(true);
    expect(res.rows[0]).toMatchObject({ label: "Home", checkouts: 4, rate: 0.4 });
  });
  it("is null when nobody opened the bag", () => {
    expect(bagPeeks({ bagPeeks: [{ pagePath: "/checkout", eventName: "begin_checkout", eventCount: 3 }] } as any, books)).toBeNull();
    expect(bagPeeks({} as any, books)).toBeNull();
  });
});

describe("readDepth", () => {
  it("shares of views reaching each mark, using page views when present", () => {
    const res = readDepth({
      pageTime: [{ pagePath: "/books/salt", screenPageViews: 40, activeUsers: 30, userEngagementDuration: 0 }],
      scrollDepth: [
        { "customEvent:percent": "25", pagePath: "/books/salt", eventCount: 30 },
        { "customEvent:percent": "50", pagePath: "/books/salt", eventCount: 20 },
        { "customEvent:percent": "75", pagePath: "/books/salt", eventCount: 10 },
        { "customEvent:percent": "100", pagePath: "/books/salt", eventCount: 4 },
        { "customEvent:percent": "50", pagePath: "/page/about", eventCount: 12 },
        { "customEvent:percent": "90", pagePath: "/page/about", eventCount: 6 },
        { "customEvent:percent": "50", pagePath: "/tiny", eventCount: 2 },
      ],
    } as any, books)!;
    expect(res.fromViews).toBe(true);
    expect(res.rows.map(r => r.label)).toEqual(["Salt", "About"]);
    expect(res.rows[0]).toMatchObject({ base: 40, reached: { 50: 0.5, 75: 0.25, 100: 0.1 } });
    expect(res.rows[1]).toMatchObject({ base: 12, reached: { 50: 1, 75: 0.5, 100: 0.5 } });
  });
  it("is null with nothing recorded", () => {
    expect(readDepth({ scrollDepth: [] } as any, books)).toBeNull();
    expect(readDepth({ scrollDepth: [{ "customEvent:percent": "(not set)", pagePath: "/", eventCount: 40 }] } as any, books)).toBeNull();
  });
});
