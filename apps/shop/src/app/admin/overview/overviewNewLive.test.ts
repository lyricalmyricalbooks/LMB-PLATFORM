import { describe, expect, it } from "vitest";
import {
  cityMap, cleanLeadDays, cleanNotes, countryCode, dailyRevenue, giftOwed, isOpenCheckout, liveNow, noteEffect, preorderRows, project, readLeadDays, reprintState, REPRINT_WORDS, soldOutCountdown, MAX_NOTES,
} from "./overviewNewLive";

const NOW = Date.parse("2026-10-18T16:00:00Z"); // noon in Toronto
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const paid = (extra: any = {}) => ({ paymentStatus: "paid", total: 20, customer: { email: "a@b.c" }, items: [], ...extra });

describe("liveNow", () => {
  it("counts recent bags, open checkouts and the last hour's sales", () => {
    const carts = [
      { updatedAt: minsAgo(5), items: [{ title: "Paper Moons" }] },
      { updatedAt: minsAgo(40), items: [] },
      { updatedAt: minsAgo(2), recovered: true },
    ];
    const orders = [
      { paymentStatus: "unpaid", paymentMethod: "stripe", createdAt: minsAgo(10), customer: { email: "x@y.z" } },
      { paymentStatus: "unpaid", paymentMethod: "stripe", createdAt: minsAgo(45), customer: { email: "x@y.z" } },
      { paymentStatus: "unpaid", paymentMethod: "etransfer", createdAt: minsAgo(5) },
      { paymentStatus: "unpaid", paymentMethod: "paypal", createdAt: minsAgo(5), status: "cancelled" },
      { paymentStatus: "unpaid", paymentMethod: "stripe", createdAt: minsAgo(5), isTest: true },
      paid({ createdAt: minsAgo(30), total: 30 }),
      paid({ createdAt: minsAgo(90) }),
      paid({ createdAt: minsAgo(5), customer: { email: "lyricalmyricalbooks@gmail.com" } }),
    ];
    expect(liveNow(orders, carts, NOW)).toEqual({ bags: 1, checkout: 1, bought: 1, boughtTotal: 30, lastBag: "Paper Moons" });
  });
  it("can count sales over the same 30 minutes as the rest", () => {
    const orders = [paid({ createdAt: minsAgo(20), total: 30 }), paid({ createdAt: minsAgo(45), total: 10 })];
    expect(liveNow(orders, [], NOW, 30)).toMatchObject({ bought: 1, boughtTotal: 30 });
    expect(liveNow(orders, [], NOW)).toMatchObject({ bought: 2 });
  });
  it("copes with no carts", () => {
    expect(liveNow([], null, NOW)).toMatchObject({ bags: 0, lastBag: null });
  });
  it("isOpenCheckout ignores paid and owner orders", () => {
    expect(isOpenCheckout({ paymentStatus: "paid", paymentMethod: "stripe" })).toBe(false);
    expect(isOpenCheckout({ paymentMethod: "card", customer: { email: "LyricalMyricalBooks@gmail.com" } })).toBe(false);
    expect(isOpenCheckout({ paymentMethod: "card" })).toBe(true);
  });
});

describe("notes", () => {
  it("cleans, dedupes, trims and sorts", () => {
    const out = cleanNotes([
      { id: "b", day: "2026-10-05", text: "  Book   fair " },
      { id: "a", day: "2026-10-01", text: "x".repeat(200) },
      { id: "a", day: "2026-10-02", text: "dup" },
      { id: "c", day: "2026-13-01", text: "bad day" },
      { id: "d", day: "2026-10-03", text: "   " },
      null, "x",
    ]);
    expect(out.map(n => n.id)).toEqual(["a", "b"]);
    expect(out[0].text).toHaveLength(80);
    expect(out[1].text).toBe("Book fair");
    expect(cleanNotes("nope")).toEqual([]);
  });
  it("keeps the newest MAX_NOTES", () => {
    const many = Array.from({ length: MAX_NOTES + 5 }, (_, i) => ({ id: `n${i}`, day: `2026-01-01`, text: "t" })).map((n, i) => ({ ...n, day: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10) }));
    const out = cleanNotes(many);
    expect(out).toHaveLength(MAX_NOTES);
    expect(out[0].id).toBe("n5");
  });
  it("daily revenue fills empty days and nets refunds", () => {
    const rows = dailyRevenue([paid({ createdAt: "2026-10-02T15:00:00Z", total: 50, refundedAmountMinor: 1000 })], "2026-10-01", "2026-10-03");
    expect(rows).toEqual([{ day: "2026-10-01", revenue: 0 }, { day: "2026-10-02", revenue: 40 }, { day: "2026-10-03", revenue: 0 }]);
  });
  it("note effect compares the next 3 days with a usual 3 days", () => {
    const orders = [
      paid({ createdAt: "2026-10-10T15:00:00Z", total: 100 }),
      paid({ createdAt: "2026-10-12T15:00:00Z", total: 50 }),
      paid({ createdAt: "2026-10-13T15:00:00Z", total: 999 }), // day 4: outside
      paid({ createdAt: "2026-09-20T15:00:00Z", total: 280 }),  // inside the 28 days before
    ];
    expect(noteEffect(orders, "2026-10-10", "2026-10-18")).toEqual({ next3: 150, usual: 30, complete: true });
    expect(noteEffect(orders, "2026-10-17", "2026-10-18").complete).toBe(false);
  });
});

describe("preorderRows", () => {
  const now = new Date(NOW);
  const books = [
    { id: "n", title: "Night Garden", status: "published", preorder: true, publishDate: "2026-11-14", trackInventory: true, stockLevel: 62 },
    { id: "a", title: "Ash & Ink", status: "published", preorder: true, publishDate: "2026-12-02", trackInventory: true, stockLevel: 1 },
    { id: "w", title: "Winter Almanac", status: "published", preorder: true },
    { id: "r", title: "Released", status: "published", preorder: true, publishDate: "2026-10-01" },
    { id: "d", title: "Draft", status: "draft", preorder: true },
  ];
  const orders = [
    paid({ items: [{ id: "n", quantity: 38, preorder: true, releaseDate: "2026-11-14" }] }),
    paid({ items: [{ id: "a", quantity: 49, preorder: true, releaseDate: "2026-12-02" }, { id: "n", quantity: 1 }] }),
    paid({ items: [{ id: "w", quantity: 6, preorder: true }] }),
  ];
  it("lists books taking pre-orders, soonest release first", () => {
    const rows = preorderRows(orders, books, now);
    expect(rows.map(r => r.bookId)).toEqual(["n", "a", "w"]);
    expect(rows[0]).toMatchObject({ promised: 38, run: 100, full: false, left: 62 });
    expect(rows[1]).toMatchObject({ promised: 49, run: 50, full: true, left: 1 });
    expect(rows[2]).toMatchObject({ promised: 6, run: null, release: "", full: false });
  });
});

describe("cityMap", () => {
  it("groups by city, places known cities and keeps other countries apart", () => {
    const at = (city: string, state: string, country: string) => paid({ customer: { address: { street: "1 Secret St", city, state, country } } });
    const m = cityMap([at("Toronto", "ON", "Canada"), at("toronto", "on", "CA"), at("Richmond", "VA", "United States"), at("Tinytown", "ON", "Canada"), at("Paris", "", "France"), at("", "", "Canada")]);
    expect(m.cities[0]).toMatchObject({ city: "Toronto", region: "ON", country: "CA", orders: 2 });
    expect(m.cities[0].x).not.toBeNull();
    const rich = m.cities.find(c => c.city === "Richmond")!;
    expect(rich.country).toBe("US");
    expect(rich.y).not.toBeNull();
    expect(m.cities.find(c => c.city === "Tinytown")!.x).toBeNull();
    expect(m.elsewhere).toEqual([{ country: "France", orders: 1 }]);
    expect(m.unknown).toBe(1);
    expect(JSON.stringify(m)).not.toContain("Secret");
  });
  it("country codes and projection", () => {
    expect(countryCode("U.S.A.")).toBe("US");
    expect(countryCode("canada")).toBe("CA");
    expect(countryCode("Mexico")).toBe("other");
    expect(project(10, -100)).toBeNull();
    expect(project(60, -130)).toEqual({ x: 0, y: 0 });
  });
});

describe("giftOwed", () => {
  it("sums what is still owed, sold this year, spent and never used", () => {
    const cards = [
      { initialMinor: 5000, balanceMinor: 2000, createdAt: daysAgo(10), enabled: true },
      { initialMinor: 5000, balanceMinor: 5000, createdAt: daysAgo(400), enabled: true },
      { initialMinor: 2500, balanceMinor: 2500, createdAt: daysAgo(30), enabled: false },
      { initialMinor: 2500, balanceMinor: 2500, createdAt: daysAgo(30), expiresOn: "2026-10-01" },
      { initialMinor: 9900, balanceMinor: 9900, createdAt: daysAgo(30), isTest: true },
    ];
    expect(giftOwed(cards, NOW)).toEqual({ owedMinor: 7000, cards: 2, soldYearMinor: 10000, spentMinor: 3000, staleCards: 1, staleMinor: 5000, total: 4 });
  });
});

describe("soldOutCountdown", () => {
  const books = [
    { id: "s", title: "Salt Hymns", status: "published", trackInventory: true, stockLevel: 8 },
    { id: "f", title: "Field Notes", status: "published", trackInventory: true, variants: [{ id: "p", name: "Paperback", stockLevel: 30 }, { id: "sg", name: "Signed", stockLevel: 2 }] },
    { id: "q", title: "Quiet", status: "published", trackInventory: true, stockLevel: 40 },
    { id: "u", title: "Untracked", status: "published", stockLevel: 3 },
  ];
  const orders = [
    paid({ createdAt: daysAgo(3), items: [{ id: "s", quantity: 12 }, { id: "f", variantId: "p", quantity: 3 }, { id: "u", quantity: 9 }] }),
    paid({ createdAt: daysAgo(40), items: [{ id: "q", quantity: 30 }] }),
    paid({ createdAt: daysAgo(5), items: [{ id: "s", quantity: 3, digital: true }] }),
  ];
  it("ranks shelves that sold lately by days left", () => {
    const rows = soldOutCountdown(orders, books, 35, NOW);
    expect(rows.map(r => r.label)).toEqual(["Salt Hymns", "Field Notes · Paperback"]);
    expect(rows[0]).toMatchObject({ stock: 8, sold30: 12, days: 20, beforeReprint: true, outOn: "2026-11-07" });
    expect(rows[1]).toMatchObject({ days: 300, beforeReprint: false });
  });
  it("lead days are cleaned", () => {
    expect(cleanLeadDays("21")).toBe(21);
    expect(cleanLeadDays(0)).toBe(35);
    expect(cleanLeadDays("x")).toBe(35);
  });
  it("typed lead days say what's wrong instead of snapping back", () => {
    expect(readLeadDays("21")).toEqual({ days: 21 });
    expect(readLeadDays(" 7 ")).toEqual({ days: 7 });
    expect(readLeadDays("0")).toHaveProperty("error");
    expect(readLeadDays("abc")).toHaveProperty("error");
    expect(readLeadDays("400")).toHaveProperty("error");
  });
  it("one set of reprint words for both stock widgets", () => {
    expect(reprintState(20, 35)).toBe("now");
    expect(reprintState(50, 35)).toBe("soon");
    expect(reprintState(60, 35)).toBe("fine");
    expect(reprintState(null, 35)).toBe("none");
    expect(reprintState(Infinity, 35)).toBe("none");
    expect(REPRINT_WORDS.now.word).toBe("Reprint now");
  });
});
