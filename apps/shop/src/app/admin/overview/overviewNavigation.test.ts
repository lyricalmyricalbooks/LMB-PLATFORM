import { describe, expect, it } from "vitest";
import { deviceSteps, followPage, landingJourneys, listClicks, pageMoves } from "./overviewNavigation";

const books = [{ id: "b1", slug: "salt", title: "Salt" }];
const HOSTS = ["lyricalmyricalbooks.com"];

describe("pageMoves", () => {
  const report: any = {
    moves: [
      { pageReferrer: "https://www.lyricalmyricalbooks.com/", pagePath: "/books/salt", screenPageViews: 12 },
      { pageReferrer: "https://lyricalmyricalbooks.com/?utm_source=x", pagePath: "/books/salt/", screenPageViews: 3 },
      { pageReferrer: "https://lyricalmyricalbooks.com/books/salt", pagePath: "/page/about", screenPageViews: 4 },
      { pageReferrer: "https://www.instagram.com/", pagePath: "/", screenPageViews: 50 },
      { pageReferrer: "", pagePath: "/", screenPageViews: 40 },
      { pageReferrer: "https://lyricalmyricalbooks.com/page/about", pagePath: "/page/about", screenPageViews: 9 },
      { pageReferrer: "not a url", pagePath: "/", screenPageViews: 1 },
    ],
  };
  it("keeps only moves between the shop's own pages, folded and labelled", () => {
    const res = pageMoves(report, books, HOSTS)!;
    expect(res.moves.map(m => [m.fromLabel, m.toLabel, m.count])).toEqual([["Home", "Salt", 15], ["Salt", "About", 4]]);
    expect(res.total).toBe(19);
    expect(res.pages[0]).toMatchObject({ path: "/books/salt", count: 19 });
  });
  it("follows one page both ways", () => {
    const res = pageMoves(report, books, HOSTS)!;
    const f = followPage(res, "/books/salt/");
    expect(f.cameFrom).toEqual([{ path: "/", label: "Home", count: 15 }]);
    expect(f.wentTo).toEqual([{ path: "/page/about", label: "About", count: 4 }]);
  });
  it("is null with nothing recorded or only outside entries", () => {
    expect(pageMoves({ moves: [] } as any, books, HOSTS)).toBeNull();
    expect(pageMoves(undefined, books, HOSTS)).toBeNull();
    expect(pageMoves({ moves: [{ pageReferrer: "https://google.com/", pagePath: "/", screenPageViews: 5 }] } as any, books, HOSTS)).toBeNull();
  });
});

describe("landingJourneys", () => {
  const report: any = {
    landingPaths: [
      { landingPage: "/", sessionDefaultChannelGroup: "Direct", sessions: 20, engagedSessions: 10, screenPageViews: 50, ecommercePurchases: 2 },
      { landingPage: "/", sessionDefaultChannelGroup: "Organic Social", sessions: 10, engagedSessions: 2, screenPageViews: 12, ecommercePurchases: 0 },
      { landingPage: "/books/salt", sessionDefaultChannelGroup: "Organic Social", sessions: 30, engagedSessions: 24, screenPageViews: 60, ecommercePurchases: 3 },
      { landingPage: "/page/about", sessionDefaultChannelGroup: "Direct", sessions: 2, engagedSessions: 2, screenPageViews: 2, ecommercePurchases: 0 },
    ],
  };
  it("adds up each first page with its channels, busiest first", () => {
    const res = landingJourneys(report, books)!;
    expect(res.channels).toEqual(["Organic Social", "Direct"]);
    expect(res.rows.map(r => r.label)).toEqual(["Home", "Salt"]);
    expect(res.rows[0]).toMatchObject({ visits: 30, purchases: 2, pagesPerVisit: 62 / 30 });
    expect(res.rows[0].engagedShare).toBeCloseTo(0.4);
    expect(res.rows[0].channels[0]).toEqual({ channel: "Direct", visits: 20, purchases: 2 });
  });
  it("narrows to one channel", () => {
    const res = landingJourneys(report, books, "Organic Social")!;
    expect(res.channel).toBe("Organic Social");
    expect(res.rows.map(r => [r.label, r.visits])).toEqual([["Salt", 30], ["Home", 10]]);
    expect(landingJourneys(report, books, "Email")!.channel).toBeNull();
  });
  it("is null when nothing reaches five visits", () => {
    expect(landingJourneys({ landingPaths: [report.landingPaths[3]] } as any, books)).toBeNull();
  });
});

describe("listClicks", () => {
  it("gives a click rate only once a list was seen 20 times", () => {
    const rows = listClicks({ lists: [
      { itemListName: "New books", itemsViewedInList: 200, itemsClickedInList: 10 },
      { itemListName: "Staff picks", itemsViewedInList: 5, itemsClickedInList: 2 },
      { itemListName: "(not set)", itemsViewedInList: 99, itemsClickedInList: 9 },
    ] } as any)!;
    expect(rows.map(r => [r.label, r.rate])).toEqual([["New books", 0.05], ["Staff picks", null]]);
    expect(listClicks({ lists: [] } as any)).toBeNull();
  });
});

describe("deviceSteps", () => {
  const row = (d: string, e: string, n: number) => ({ deviceCategory: d, eventName: e, activeUsers: n });
  it("builds each device's path and finds where phones fall behind most", () => {
    const res = deviceSteps({ deviceSteps: [
      row("mobile", "session_start", 100), row("mobile", "view_item", 50), row("mobile", "add_to_cart", 5), row("mobile", "begin_checkout", 4), row("mobile", "purchase", 2),
      row("desktop", "session_start", 50), row("desktop", "view_item", 25), row("desktop", "add_to_cart", 10), row("desktop", "begin_checkout", 6), row("desktop", "purchase", 3),
      row("smart tv", "session_start", 3),
    ] } as any)!;
    expect(res.devices.map(d => d.label)).toEqual(["Phones", "Computers"]);
    expect(res.devices[0].steps[2]).toMatchObject({ label: "Added to bag", people: 5, ofPrevious: 0.1 });
    expect(res.gap).toEqual({ step: "Added to bag", phone: 0.1, computer: 0.4 });
  });
  it("has no gap without both phones and computers, and is null with no visits", () => {
    expect(deviceSteps({ deviceSteps: [row("mobile", "session_start", 4)] } as any)!.gap).toBeNull();
    expect(deviceSteps({ deviceSteps: [row("mobile", "view_item", 4)] } as any)).toBeNull();
  });
});
