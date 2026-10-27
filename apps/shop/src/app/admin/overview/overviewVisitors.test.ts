import { describe, expect, it } from "vitest";
import { actionRows, liveMinutes, livePagesOf, outboundRows, pageLabel, pageTimeRows, visitHeat, visitorMix } from "./overviewVisitors";

const books = [
  { id: "b1", slug: "night-songs", title: "Night Songs", photos: [{ url: "https://x/b1.jpg" }] },
  { id: "b2", slug: "", title: "Untitled Zine" },
];
const base: any = {
  totals: { current: { activeUsers: 100, newUsers: 70, sessions: 140 }, previous: { activeUsers: 50, newUsers: 40 } },
  byDate: { current: [], previous: [] }, channels: [], sources: [], landing: [], countries: [], devices: [], pages: [],
  visitorType: [], events: { current: {}, previous: {} }, activeNow: 1,
};

describe("pageLabel", () => {
  it("names home, books, custom pages and collections", () => {
    expect(pageLabel("/", books)).toBe("Home");
    expect(pageLabel("", books)).toBe("Home");
    expect(pageLabel("/books/night-songs", books)).toBe("Night Songs");
    expect(pageLabel("/books/Night-Songs/?ref=ig", books)).toBe("Night Songs");
    expect(pageLabel("/books/b2", books)).toBe("Untitled Zine");
    expect(pageLabel("/books/gone-book", books)).toBe("Gone Book");
    expect(pageLabel("/page/open-calls", books)).toBe("Open Calls");
    expect(pageLabel("/collections/zines", books)).toBe("Zines");
    expect(pageLabel("/checkout", books)).toBe("Checkout");
    expect(pageLabel("/odd/path", books)).toBe("/odd/path");
    expect(pageLabel("(not set)", books)).toBe("Unknown page");
  });
});

describe("pageTimeRows", () => {
  const report = {
    ...base,
    pageTime: [
      { pagePath: "/", screenPageViews: 100, activeUsers: 60, userEngagementDuration: 1000 },
      { pagePath: "/books/night-songs", screenPageViews: 40, activeUsers: 30, userEngagementDuration: 2400 },
      { pagePath: "/books/night-songs/", screenPageViews: 10, activeUsers: 5, userEngagementDuration: 600 },
      { pagePath: "/page/about", screenPageViews: 9, activeUsers: 9, userEngagementDuration: 900 },
    ],
    pageActions: [
      { pagePath: "/books/night-songs", eventName: "scroll", eventCount: 25 },
      { pagePath: "/books/night-songs", eventName: "add_to_cart", eventCount: 4 },
      { pagePath: "/", eventName: "scroll", eventCount: 30 },
    ],
  };
  it("folds duplicate paths, drops pages under 10 views and sorts by time", () => {
    const res = pageTimeRows(report, books, "time")!;
    expect(res.rows.map(r => r.path)).toEqual(["/books/night-songs", "/"]);
    const book = res.rows[0];
    expect(book).toMatchObject({ label: "Night Songs", bookId: "b1", views: 50, people: 35, seconds: 60, readShare: 0.5, bagAdds: 4 });
    expect(book.cover).toContain("b1.jpg");
    expect(res.rows[1]).toMatchObject({ seconds: 10, readShare: 0.3, bagAdds: 0 });
    expect(res.hasScroll).toBe(true);
  });
  it("sorts by views on request", () => {
    expect(pageTimeRows(report, books, "views")!.rows.map(r => r.path)).toEqual(["/", "/books/night-songs"]);
  });
  it("hides the read share when no scroll events exist at all", () => {
    const res = pageTimeRows({ ...report, pageActions: [] }, books)!;
    expect(res.hasScroll).toBe(false);
    expect(res.rows.every(r => r.readShare === null)).toBe(true);
    expect(pageTimeRows({ ...report, pageActions: undefined }, books)!.rows[0].bagAdds).toBeNull();
  });
  it("is null when never recorded or nothing has enough views", () => {
    expect(pageTimeRows(base, books)).toBeNull();
    expect(pageTimeRows(null, books)).toBeNull();
    expect(pageTimeRows({ ...base, pageTime: [] }, books)).toBeNull();
    expect(pageTimeRows({ ...base, pageTime: [{ pagePath: "/", screenPageViews: 3, activeUsers: 1, userEngagementDuration: 9 }] }, books)).toBeNull();
  });
});

describe("visitHeat", () => {
  it("starts the week on Monday and names the busiest hour", () => {
    const heat = visitHeat({ ...base, when: [
      { dayOfWeek: "0", hour: "21", activeUsers: 7, sessions: 8 },
      { dayOfWeek: "1", hour: "09", activeUsers: 3, sessions: 3 },
      { dayOfWeek: "1", hour: "09", activeUsers: 1, sessions: 1 },
      { dayOfWeek: "9", hour: "09", activeUsers: 50, sessions: 50 },
    ] })!;
    expect(heat.rows.map(r => r.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(heat.rows[0].hours[9]).toBe(4);
    expect(heat.rows[6].hours[21]).toBe(7);
    expect(heat.rows.every(r => r.hours.length === 24)).toBe(true);
    expect(heat.busiest).toEqual({ day: "Sun", hour: 21, visitors: 7 });
    expect(heat).toMatchObject({ max: 7, total: 11 });
  });
  it("is null when never recorded or empty", () => {
    expect(visitHeat(base)).toBeNull();
    expect(visitHeat({ ...base, when: [{ dayOfWeek: "1", hour: "02", activeUsers: 0, sessions: 0 }] })).toBeNull();
  });
});

describe("actionRows", () => {
  it("uses Google's events, merging search events, with the period before", () => {
    const res = actionRows({ ...base, actions: {
      current: { scroll: { eventCount: 90, activeUsers: 40 }, search: { eventCount: 12, activeUsers: 8 }, search_no_results: { eventCount: 3, activeUsers: 2 }, click: { eventCount: 5, activeUsers: 4 }, view_search_results: { eventCount: 1, activeUsers: 1 } },
      previous: { scroll: { eventCount: 20, activeUsers: 10 } },
    } }, [], [])!;
    expect(res.source).toBe("google");
    expect(res.rows.map(r => r.key)).toEqual(["readToEnd", "searched", "linkOut"]);
    expect(res.rows[0]).toMatchObject({ people: 40, times: 90, prev: 10 });
    expect(res.rows[1]).toMatchObject({ people: 8, times: 15, prev: 0 });
  });
  it("gives no 'before' figure when the period before recorded nothing", () => {
    const res = actionRows({ ...base, actions: { current: { scroll: { eventCount: 1, activeUsers: 1 } }, previous: {} } }, [], [])!;
    expect(res.rows[0].prev).toBeNull();
  });
  it("falls back to the shop counters without Google, leaving unrecorded counters out", () => {
    const cur = [{ bookViews: { a: 5, b: 2 }, bookAdds: { a: 1 }, searches: { poems: 2 } }, { bookViews: { a: 1 }, noResults: { xyz: 1 } }];
    const prev = [{ bookViews: { a: 3 } }];
    const res = actionRows(null, cur, prev)!;
    expect(res.source).toBe("shop");
    expect(res.rows).toEqual([
      { key: "openedBook", label: expect.any(String), people: 8, times: null, prev: 3 },
      { key: "searched", label: expect.any(String), people: 3, times: null, prev: null },
      { key: "addedToBag", label: expect.any(String), people: 1, times: null, prev: null },
    ]);
    // An older server (no actions key) also falls back.
    expect(actionRows(base, cur, prev)!.source).toBe("shop");
  });
  it("is null when nothing was recorded anywhere", () => {
    expect(actionRows(null, [{ visits: 3 }], [])).toBeNull();
    expect(actionRows(null, [], [])).toBeNull();
  });
});

describe("outboundRows", () => {
  it("folds www, drops the shop's own and unknown domains, most clicks first", () => {
    const rows = outboundRows({ ...base, outbound: [
      { linkDomain: "bandcamp.com", eventCount: 3, activeUsers: 2 },
      { linkDomain: "www.instagram.com", eventCount: 4, activeUsers: 3 },
      { linkDomain: "instagram.com", eventCount: 2, activeUsers: 2 },
      { linkDomain: "(not set)", eventCount: 9, activeUsers: 9 },
      { linkDomain: "lyricalmyricalbooks.com", eventCount: 9, activeUsers: 9 },
    ] }, ["https://www.lyricalmyricalbooks.com"])!;
    expect(rows).toEqual([
      { key: "instagram.com", domain: "instagram.com", label: "instagram.com", clicks: 6, people: 5 },
      { key: "bandcamp.com", domain: "bandcamp.com", label: "bandcamp.com", clicks: 3, people: 2 },
    ]);
  });
  it("is null when never recorded or empty", () => {
    expect(outboundRows(base)).toBeNull();
    expect(outboundRows({ ...base, outbound: [] })).toBeNull();
  });
});

describe("visitorMix", () => {
  it("splits new and returning now and before, with engagement per group", () => {
    const mix = visitorMix({ ...base, visitorType: [
      { newVsReturning: "new", activeUsers: 70, sessions: 80, engagementRate: 0.4 },
      { newVsReturning: "returning", activeUsers: 35, sessions: 70, engagementRate: 0.7 },
    ] })!;
    expect(mix.current).toEqual({ newVisitors: 70, returning: 30 });
    expect(mix.previous).toEqual({ newVisitors: 40, returning: 10 });
    expect(mix.engagement).toEqual({ newVisitors: 0.4, returning: 0.7 });
    expect(mix.visitsPerVisitor.returning).toBe(2);
  });
  it("floors returning at 0 and has no 'before' or engagement when not sent", () => {
    const mix = visitorMix({ ...base, totals: { current: { activeUsers: 5, newUsers: 9 }, previous: {} } })!;
    expect(mix.current).toEqual({ newVisitors: 5, returning: 0 });
    expect(mix.previous).toBeNull();
    expect(mix.engagement).toEqual({ newVisitors: null, returning: null });
  });
  it("is null with no visitors", () => {
    expect(visitorMix(null)).toBeNull();
    expect(visitorMix({ ...base, totals: { current: {}, previous: {} } })).toBeNull();
  });
});

describe("live pages and minutes", () => {
  it("lists open pages by people", () => {
    expect(livePagesOf({ ...base, realtimePages: [
      { unifiedScreenName: "Home", activeUsers: 1, screenPageViews: 1 },
      { unifiedScreenName: "", activeUsers: 2, screenPageViews: 3 },
      { unifiedScreenName: "Gone", activeUsers: 0, screenPageViews: 0 },
    ] })).toEqual([
      { key: "Unknown page", label: "Unknown page", people: 2, views: 3 },
      { key: "Home", label: "Home", people: 1, views: 1 },
    ]);
    expect(livePagesOf({ ...base, realtimePages: null })).toBeNull();
    expect(livePagesOf(base)).toBeNull();
    expect(livePagesOf({ ...base, realtimePages: [] })).toBeNull();
  });
  it("gives 30 minutes oldest first, this minute last", () => {
    const m = liveMinutes({ ...base, realtimeMinutes: [{ minutesAgo: 0, activeUsers: 3 }, { minutesAgo: 29, activeUsers: 1 }, { minutesAgo: 40, activeUsers: 9 }] })!;
    expect(m).toHaveLength(30);
    expect(m[29]).toBe(3);
    expect(m[0]).toBe(1);
    expect(m.slice(1, 29).every(n => n === 0)).toBe(true);
    expect(liveMinutes({ ...base, realtimeMinutes: null })).toBeNull();
    expect(liveMinutes(base)).toBeNull();
  });
});
