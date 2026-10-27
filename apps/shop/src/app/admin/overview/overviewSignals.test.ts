import { describe, expect, it } from "vitest";
import {
  acquisitionCoverage, campaignPerformance, checkoutJourney, gaCampaignVisits, landingPerformance, newsletterWeeks,
  pageSpeedSummary, reminderResults, titleFlag, titleFlags, MAX_TITLE_FLAGS, wantedButUnavailable,
} from "./overviewSignals";
import { titlePerformance, titlesCsv } from "./overviewProfit";
import { applyOwnerDeviceLink, isOwnOrder, isOwnerDevice, looksAutomated, markOwnerDeviceOnSignIn, ownerDeviceChoice, setOwnerDevice } from "../../lib/ownerDevice";
import { grade, parseSpeedKey, speedKey } from "../../lib/pageSpeed";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};
const paid = (id: string, extra: Record<string, any> = {}) => ({
  id, paymentStatus: "paid", total: 40, createdAt: "2026-10-14T15:00:00Z", customer: { email: `${id}@example.com` }, items: [], ...extra,
});

describe("your own visits", () => {
  it("is left out once marked, and a sign-in marks it unless the owner chose to count it", () => {
    const s = memory();
    expect(isOwnerDevice(s)).toBe(false);
    markOwnerDeviceOnSignIn(s);
    expect(isOwnerDevice(s)).toBe(true);
    setOwnerDevice(false, s);
    markOwnerDeviceOnSignIn(s);
    expect(ownerDeviceChoice(s)).toBe("off");
  });

  it("takes ?owner-device=on|off from the address and removes it", () => {
    const s = memory();
    expect(applyOwnerDeviceLink("https://shop.test/books/x?owner-device=on&ref=ig#top", s)).toBe("/books/x?ref=ig#top");
    expect(isOwnerDevice(s)).toBe(true);
    expect(applyOwnerDeviceLink("https://shop.test/?owner-device=off", s)).toBe("/");
    expect(isOwnerDevice(s)).toBe(false);
    expect(applyOwnerDeviceLink("https://shop.test/?ref=ig", s)).toBeNull();
  });

  it("knows the owner's orders and robots", () => {
    expect(isOwnOrder({ customer: { email: " LyricalMyricalBooks@gmail.com " } })).toBe(true);
    expect(isOwnOrder({ customer: { email: "reader@example.com" }, metadata: { ownerDevice: true } } as any)).toBe(false);
    expect(isOwnOrder({ customer: { email: "reader@example.com" } })).toBe(false);
    expect(looksAutomated({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" })).toBe(true);
    expect(looksAutomated({ userAgent: "Mozilla/5.0 HeadlessChrome/120" })).toBe(true);
    expect(looksAutomated({ userAgent: "Mozilla/5.0 (iPhone)", webdriver: true })).toBe(true);
    expect(looksAutomated({ userAgent: "Mozilla/5.0 (Macintosh) Safari/605" })).toBe(false);
  });
});

describe("page speed", () => {
  it("grades each measure with Google's limits and keys a visit by device", () => {
    expect(grade("lcp", 2400)).toBe("g");
    expect(grade("lcp", 3000)).toBe("o");
    expect(grade("inp", 900)).toBe("p");
    expect(grade("cls", null)).toBe("n");
    expect(speedKey(390, { lcp: 1800, inp: null, cls: 0.3 })).toBe("phone_gnp");
    expect(parseSpeedKey("computer_ggo")).toEqual({ device: "computer", lcp: "g", inp: "g", cls: "o" });
    expect(parseSpeedKey("tablet_ggg")).toBeNull();
  });

  it("adds visits up per device and leaves unmeasured visits out of a measure's share", () => {
    const s = pageSpeedSummary([{ date: "2026-10-14", vitals: { phone_ggg: 3, phone_png: 1, computer_ggg: 2 } }]);
    const phone = s.devices.find(d => d.device === "phone")!;
    expect(phone.visits).toBe(4);
    expect(phone.lcp.goodShare).toBe(75);
    expect(phone.lcp.passes).toBe(true);
    expect(phone.inp.measured).toBe(3);
    expect(pageSpeedSummary([]).recorded).toBe(false);
  });
});

describe("checkout journey", () => {
  it("shows each step and the biggest drop, and nothing until steps were recorded", () => {
    expect(checkoutJourney([{ date: "2026-10-14", funnel: { checkout_start: 9 } }]).recorded).toBe(false);
    const j = checkoutJourney([{ date: "2026-10-14", funnel: { checkout_start: 10, purchase: 2 }, checkout: { email: 8, address: 7, delivery: 6, pay: 2, declined: 1 } }]);
    expect(j.steps.map(s => s.count)).toEqual([10, 8, 7, 6, 2, 2]);
    expect(j.steps[4].lost).toBe(4);
    expect(j.biggestDrop).toContain("pressed pay");
    expect(j.problems.declined).toBe(1);
  });
});

describe("titles", () => {
  it("flags books looked at but not bagged, and bagged but not bought, only once bag adds exist", () => {
    expect(titleFlag({ views: 40, adds: 0, units: 0 })).toBe("browsed");
    expect(titleFlag({ views: 40, adds: null, units: 0 })).toBeNull();
    expect(titleFlag({ views: 40, adds: 8, units: 1 })).toBe("abandoned");
    expect(titleFlag({ views: 40, adds: 8, units: 4 })).toBeNull();
  });

  it("flags titles only against the shop's own rates, and at most three", () => {
    // A quiet shop: every title is bagged ~10% of views and bought ~30% of adds. Nobody stands out, so no flags.
    const even = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, views: 100, adds: 10, units: 3 }));
    expect(titleFlags(even).size).toBe(0);
    const rows = [
      ...even,
      { id: "looked", views: 120, adds: 1, units: 0 },   // bagged far below the shop's 10%
      { id: "bagged", views: 100, adds: 20, units: 1 },  // bought far below the shop's ~30% of adds
      { id: "few", views: 100, adds: 6, units: 0 },      // too few adds to judge
      { id: "noadds", views: 300, adds: null, units: 0 }, // bag adds not recorded for it
    ];
    const flags = titleFlags(rows);
    expect(flags.get("looked")).toBe("browsed");
    expect(flags.get("bagged")).toBe("abandoned");
    expect(flags.has("few")).toBe(false);
    expect(flags.has("noadds")).toBe(false);
    const many = [...even, ...Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, views: 100 + i * 10, adds: 0, units: 0 }))];
    const top = titleFlags(many);
    expect(top.size).toBe(MAX_TITLE_FLAGS);
    expect([...top.keys()]).toEqual(["q5", "q4", "q3"]);
  });

  it("adds the bag column to the table and its CSV", () => {
    const books = [{ id: "b1", title: "Riso Book" }];
    const rows = titlePerformance({ current: [], previous: [], books, costs: {}, viewsById: { b1: 30 }, addsById: { b1: 6 }, stock: [] });
    expect(rows[0].adds).toBe(6);
    expect(rows[0].flag).toBe("abandoned");
    expect(titlesCsv(rows, "2026-10-01", "2026-10-14")).toContain("Bagged, not bought");
  });
});

describe("campaigns and landing pages", () => {
  const acq = (a: Record<string, string>) => JSON.stringify(a);
  const orders = [
    paid("a", { acquisition: acq({ source: "instagram", medium: "social", campaign: "Autumn", landingPage: "/books/x" }) }),
    paid("b", { acquisition: acq({ source: "instagram", medium: "social", campaign: "autumn", landingPage: "/books/x" }), total: 20 }),
    paid("c", { referralSource: "google" }),
    paid("d"),
    paid("t", { isTest: true }),
  ];
  it("groups sales by campaign, else by source", () => {
    const rows = campaignPerformance(orders, orders, { visitsBySource: { google: 50 }, gaVisits: gaCampaignVisits([{ sessionCampaignName: "Autumn", sessions: 30 }, { sessionCampaignName: "(not set)", sessions: 900 }]) });
    const autumn = rows.find(r => r.key === "c:autumn")!;
    expect(autumn.orders).toBe(2);
    expect(autumn.revenue).toBe(60);
    expect(autumn.visits).toBe(30);
    expect(autumn.newCustomers).toBe(2);
    expect(rows.find(r => r.label === "google")!.visits).toBe(50);
    expect(rows.find(r => r.label === "Direct visits")!.orders).toBe(1);
    expect(rows.some(r => r.revenue === 0)).toBe(false);
  });
  it("lists landing pages and how much of the period carries the record", () => {
    expect(landingPerformance(orders)).toEqual([{ page: "/books/x", orders: 2, revenue: 60 }]);
    expect(acquisitionCoverage(orders, orders)).toMatchObject({ orders: 4, recorded: 2 });
  });
});

describe("reminders and newsletter", () => {
  it("counts reminders sent in the period and the shoppers who bought after", () => {
    const start = Date.parse("2026-10-10T00:00:00Z");
    const r = reminderResults([
      { notified: true, notifiedAt: "2026-10-12T10:00:00Z", recovered: true, recoveredAt: "2026-10-12T12:00:00Z", subtotal: 25 },
      { notified: true, notifiedAt: "2026-10-12T10:00:00Z" },
      { notified: true, notifySkipped: "throttled", notifiedAt: "2026-10-12T10:00:00Z" },
      { notified: true, notifiedAt: "2026-10-01T10:00:00Z", recovered: true, recoveredAt: "2026-10-02T10:00:00Z" },
    ], start, Date.parse("2026-10-18T00:00:00Z"));
    expect(r).toEqual({ sent: 2, bought: 1, rate: 50, value: 25 });
  });
  it("splits sign-ups into weeks, confirmed and waiting", () => {
    const now = Date.parse("2026-10-18T12:00:00Z"); // a Sunday: its week started Monday 12 October
    const weeks = newsletterWeeks([{ confirmedAt: "2026-10-13T10:00:00Z" }, { subscribedAt: "2026-10-06T10:00:00Z" }], [{ requestedAt: "2026-10-14T10:00:00Z" }], 3, now);
    expect(weeks.map(w => [w.week, w.confirmed, w.waiting])).toEqual([["2026-09-28", 0, 0], ["2026-10-05", 1, 0], ["2026-10-12", 1, 1]]);
  });
});

describe("wanted but unavailable", () => {
  it("ranks books by views while unavailable, saves and waiting sign-ups", () => {
    const books = [{ id: "s", title: "Sold out", stockLevel: 0 }, { id: "n", title: "In stock", stockLevel: 4 }, { id: "c", title: "Soon", comingSoon: true, status: "published" }];
    const rows = wantedButUnavailable(
      [{ date: "2026-10-14", unbuyableViews: { s: 4, c: 2 }, wishlistAdds: { s: 1, n: 9 } }],
      books, [{ status: "waiting", bookId: "s" }, { status: "sent", bookId: "c" }],
    );
    expect(rows.map(r => [r.id, r.state, r.views, r.saves, r.waiting])).toEqual([["s", "sold out", 4, 1, 1], ["c", "coming soon", 2, 0, 0]]);
  });
});
