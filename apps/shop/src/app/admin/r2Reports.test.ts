// PR 10 (reports, analytics and performance): regression tests for the Overview figures and the admin refreshes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSeries, dailyDocsNeeded, dailyWindow, sourcePerformance } from "./overview/overviewTraffic";
import { periodKeys, splitPeriods, toFulfil, totals } from "./overview/overviewInsights";
import { salesReportCsv } from "./overview/salesReport";
import { discountPerformance } from "./discountPerformance";
import { backupAlert, checkFailedAlert } from "./adminAlerts";
import { mergeNewestPage } from "./ordersDesk";
import { orderDay } from "../lib/shopDay";
import { analyticsKey } from "../lib/analyticsKeys";
import { orderApi, shouldCountPurchase } from "../lib/commerce";

// 2026-10-09 23:30 in Toronto (EDT, UTC-4) is already 2026-10-10 03:30 in UTC.
const EVENING_ORDER = "2026-10-10T03:30:00Z";
const NOW = Date.parse("2026-10-10T03:45:00Z");
const paid = (over: Record<string, any>) => ({ id: "o", paymentStatus: "paid", total: 10, createdAt: EVENING_ORDER, ...over });

describe("#123 Toronto days for orders", () => {
  it("an order placed after 8pm Toronto time belongs to that Toronto day", () => {
    expect(orderDay(EVENING_ORDER)).toBe("2026-10-09");
    expect(orderDay("2026-09-29")).toBe("2026-09-29");
    expect(orderDay("")).toBe("");
  });
  it("'Today' is the Toronto day, so an evening order is still in it", () => {
    expect(periodKeys(1, NOW)).toEqual({ endKey: "2026-10-09", startKey: "2026-10-09", prevStartKey: "2026-10-08" });
    const p = splitPeriods([paid({ id: "evening" })], 1, NOW);
    expect(p.current.map(o => o.id)).toEqual(["evening"]);
  });
  it("the chart puts the evening order on its Toronto day and keeps visits on their stored (UTC) day", () => {
    const series = buildSeries([paid({})], [{ date: "2026-10-10", visits: 7 }], 3, NOW);
    expect(series.map(p => p.date)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(series[2]).toMatchObject({ orders: 1, revenue: 10, visits: 0 });
  });
  it("traffic windows still count the UTC days the analytics docs are keyed by", () => {
    const w = dailyWindow([{ date: "2026-10-10", visits: 7 }], 1, NOW);
    expect(w.endKey).toBe("2026-10-10");
    expect(w.current).toHaveLength(1);
  });
  it("the sales report files the evening order under its Toronto day", () => {
    const csv = salesReportCsv([paid({ items: [] })], "2026-10-08", "2026-10-09");
    expect(csv).toContain('"2026-10-09","1"');
  });
  it("the Orders CSV adds the Toronto day beside the raw UTC moment", () => {
    const csv = orderApi.exportToCsv([paid({ paidAt: EVENING_ORDER })]);
    const [header, row] = csv.split("\n");
    expect(header).toContain('"ShopDate","PaidShopDate"');
    expect(row).toContain('"2026-10-09","2026-10-09"');
    expect(row).toContain(`"${EVENING_ORDER}"`);
  });
});

describe("#122 traffic sources join visits to orders", () => {
  it("a dotted referrer is one row with its visits and its orders", () => {
    const rows = sourcePerformance({ [analyticsKey("duckduckgo.com")]: 40 }, [paid({ referralSource: "duckduckgo.com", total: 20 }), paid({ id: "b", referralSource: "DuckDuckGo.com", total: 30 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "duckduckgo com", visits: 40, orders: 2, revenue: 50 });
    expect(rows[0].conversion).toBeCloseTo(5);
  });
  it("campaign names with dots join too", () => {
    const rows = sourcePerformance({ "newsletter oct": 10 }, [paid({ referralSource: "newsletter.oct" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toBe(1);
  });
});

describe("#121 paid orders waiting to ship", () => {
  const base = { paymentStatus: "paid", paidAt: "2026-09-01T12:00:00Z", createdAt: "2026-09-01T12:00:00Z", items: [{ id: "b", quantity: 1, price: 10, title: "B" }], customer: { address: { country: "CA", state: "ON", zip: "M5V 2T6", address: "1 A St", city: "Toronto" } } };
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("leaves out pre-orders that cannot ship yet and parcels packed for collection", () => {
    const preorder = { ...base, id: "pre", items: [{ id: "b", quantity: 1, price: 10, title: "B", preorder: true, releaseDate: "2027-01-01" }] };
    const pickup = { ...base, id: "pick", fulfillmentStatus: "ready_for_pickup" };
    const normal = { ...base, id: "ship" };
    const ids = toFulfil([preorder, pickup, normal], now).map(o => o.id);
    expect(ids).not.toContain("pre");
    expect(ids).not.toContain("pick");
    expect(ids).toContain("ship");
  });
  it("counts the wait from the pre-order release, not from when it was ordered", () => {
    const released = { ...base, id: "rel", preorderReleasedAt: "2026-10-08T12:00:00Z", items: [{ id: "b", quantity: 1, price: 10, title: "B", preorder: true, releaseDate: "2026-10-08" }] };
    const [row] = toFulfil([released], now);
    expect(row?.ageDays).toBe(2);
  });
});

describe("#125 money panel", () => {
  it("shows what gift cards paid and gift cards sold, apart from the card total", () => {
    const t = totals([{ total: 40, tax: 5, giftCardAmount: 10, items: [{ giftCard: true, price: 25, quantity: 2 }] }]);
    expect(t.giftCards).toBe(10);
    expect(t.giftCardsSold).toBe(50);
    expect(t.net).toBe(40);
  });
});

describe("#129 automatic offers show their title", () => {
  it("keeps the offer's title for an automatic discount", () => {
    const m = discountPerformance([paid({ appliedDiscount: { id: "8f3kQ", code: null, automatic: true, title: "Spring offer" } })]);
    expect(m.get("#8f3kQ")?.label).toBe("Spring offer");
    expect(discountPerformance([paid({ appliedDiscount: { code: "save10" } })]).get("SAVE10")?.label).toBe("SAVE10");
  });
});

describe("#127 one-year comparison", () => {
  it("reads enough daily docs for the period and the block before it", () => {
    expect(dailyDocsNeeded(365)).toBeGreaterThanOrEqual(2 * 365);
    expect(dailyDocsNeeded(30)).toBeGreaterThanOrEqual(60);
  });
});

describe("#126/#130 funnel counts", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("counts a purchase once per order, however often the confirmation reloads", () => {
    const s = mem();
    expect(shouldCountPurchase("A1", { paymentStatus: "paid" }, s)).toBe(true);
    expect(shouldCountPurchase("A1", { paymentStatus: "paid" }, s)).toBe(false);
    expect(shouldCountPurchase("A2", { paymentStatus: "paid" }, s)).toBe(true);
  });
  it("never counts a sandbox or test order", () => {
    expect(shouldCountPurchase("T", { isTest: true }, mem())).toBe(false);
    expect(shouldCountPurchase("S", { sandboxPayment: true }, mem())).toBe(false);
  });
});

describe("#85/#20 alert refresh and backup", () => {
  it("a failed read produces a visible warning with Try again", () => {
    const a = checkFailedAlert(["the Stripe webhook status"]);
    expect(a).toMatchObject({ id: "alerts-check-failed", action: "retry", tone: "warning" });
    expect(a!.detail).toContain("the Stripe webhook status");
    expect(checkFailedAlert([])).toBeNull();
  });
  it("alerts when the last backup failed or is overdue, not when it is fine or unrecorded", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(backupAlert({ ok: false, lastAttemptAt: "2026-10-10T07:17:00Z", error: "permission denied" }, now)).toMatchObject({ id: "backup", tone: "danger", action: "general" });
    expect(backupAlert({ ok: true, lastAttemptAt: "2026-10-05T07:17:00Z", lastSuccessAt: "2026-10-05T07:17:00Z" }, now)).toMatchObject({ tone: "warning" });
    expect(backupAlert({ ok: true, lastAttemptAt: "2026-10-10T07:17:00Z", lastSuccessAt: "2026-10-10T07:17:00Z" }, now)).toBeNull();
    expect(backupAlert(null, now)).toBeNull();
    expect(backupAlert(undefined, now)).toBeNull();
  });
});

describe("#81 incremental Orders refresh", () => {
  it("the newest page replaces its own orders and keeps older ones untouched", () => {
    const previous = [{ id: "c", v: 1 }, { id: "b", v: 1 }, { id: "a", v: 1 }];
    const page = [{ id: "d", v: 2 }, { id: "c", v: 2 }];
    expect(mergeNewestPage(previous, page)).toEqual([{ id: "d", v: 2 }, { id: "c", v: 2 }, { id: "b", v: 1 }, { id: "a", v: 1 }]);
    expect(mergeNewestPage(null, page)).toBe(page);
  });
});

describe("#33/#81/#85 source guards", () => {
  const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
  it("Inventory reads every order through the shared cache, not the newest 500", () => {
    const src = read("Inventory.tsx");
    expect(src).not.toContain("getOrders(500)");
    expect(src).toContain("getOrdersCached()");
  });
  it("the Orders desk polls incrementally, and opening or closing an order never forces a full re-read", () => {
    expect(read("OrdersDesk.tsx")).toContain("refreshOrdersCache({ incremental: true })");
    const dash = read("Dashboard.tsx");
    expect(dash).toContain("getOrdersCached({ maxAgeMs })");
    expect(dash).not.toContain("force: !first.current");
    expect(read("Orders.tsx")).toContain("FULL_REFRESH_MS");
  });
  it("the alert check reads nothing while the admin tab is hidden and reuses the Orders desk's copy", () => {
    const dash = read("Dashboard.tsx");
    expect(dash).toContain("!document.hidden && Date.now() - lastCheck >= ALERT_CHECK_MS");
    expect(dash).toContain('document.addEventListener("visibilitychange", check)');
    expect(dash).toContain("refresh(ALERT_ORDERS_MAX_AGE_MS)");
    // The full check (orders, email log, status documents) runs once per sign-in; returning from an order only re-counts.
    expect(dash).toMatch(/\n  \}, \[user\]\);\n/);
    expect(dash).toContain("const data = peekOrders();");
    expect(read("Orders.tsx")).toContain("noteLoadedOrders(data)");
  });
  it("Discounts and Reviews read orders through the shared copy", () => {
    for (const f of ["Discounts.tsx", "ReviewsModeration.tsx"]) {
      expect(read(f)).toContain("getOrdersCached()");
      expect(read(f)).not.toContain("adminApi.getAllOrders()");
    }
  });
  it("an order changed on its own page also updates the shared copy", () => {
    expect(read("Orders.tsx")).toContain("patchCachedOrder(order)");
  });
});
