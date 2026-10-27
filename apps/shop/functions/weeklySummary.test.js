import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { lastWeek, buildWeeklySummary, weeklySummaryEnabled, firstOrders, countsAsSale } = require("./weeklySummary");
const { handleSearchConsole, pickSite, cleanSite, scErrorMessage } = require("./searchConsole");

// Monday 19 October 2026, 08:00 in Toronto.
const MONDAY = Date.parse("2026-10-19T12:00:00Z");
const order = (id, createdAt, extra = {}) => ({
  id, createdAt, paymentStatus: "paid", total: 30, customer: { email: `${id}@example.com` },
  items: [{ bookId: "b1", name: "Riso Book", quantity: 1 }], ...extra,
});

describe("Monday summary", () => {
  it("covers last Monday to Sunday and the week before, on Toronto days", () => {
    expect(lastWeek(MONDAY)).toEqual({ start: "2026-10-12", end: "2026-10-18", prevStart: "2026-10-05", prevEnd: "2026-10-11" });
    // Sunday evening in Toronto is already Monday in UTC: still "last week" is the one before.
    expect(lastWeek(Date.parse("2026-10-19T03:00:00Z")).start).toBe("2026-10-05");
  });

  it("leaves out tests, sandbox, unpaid and the owner's own orders", () => {
    expect(countsAsSale(order("a", "2026-10-13T15:00:00Z"))).toBe(true);
    expect(countsAsSale(order("t", "2026-10-13T15:00:00Z", { isTest: true }))).toBe(false);
    expect(countsAsSale(order("s", "2026-10-13T15:00:00Z", { sandboxPayment: true }))).toBe(false);
    expect(countsAsSale(order("u", "2026-10-13T15:00:00Z", { paymentStatus: "unpaid" }))).toBe(false);
    expect(countsAsSale(order("o", "2026-10-13T15:00:00Z", { customer: { email: "LyricalMyricalBooks@gmail.com" } }))).toBe(false);
    // A customer's order rung up on the owner's computer is a real sale.
    expect(countsAsSale(order("d", "2026-10-13T15:00:00Z", { metadata: { ownerDevice: true } }))).toBe(true);
  });

  it("compares the two weeks and names the best sellers", () => {
    const orders = [
      order("a", "2026-10-13T15:00:00Z", { items: [{ bookId: "b1", name: "Riso Book", quantity: 2 }], total: 60 }),
      order("b", "2026-10-18T23:00:00Z", { items: [{ bookId: "b2", name: "Zine <One>", quantity: 1 }] }), // Sunday evening Toronto
      order("c", "2026-10-07T15:00:00Z"),
      order("x", "2026-10-14T15:00:00Z", { customer: { email: "lyricalmyricalbooks@gmail.com" }, total: 999 }),
      order("old", "2026-09-01T15:00:00Z", { customer: { email: "a@example.com" } }),
    ];
    const daily = [{ date: "2026-10-13", visits: 100, funnel: { checkout_start: 4 } }, { date: "2026-10-06", visits: 50 }];
    const { subject, html, figures } = buildWeeklySummary({ orders, daily, week: lastWeek(MONDAY), firstOrderIds: firstOrders(orders), toDo: { toShip: 2 } });
    expect(figures.cur.orders).toBe(2);
    expect(figures.cur.revenue).toBe(90);
    expect(figures.prev.orders).toBe(1);
    expect(figures.cur.newCustomers).toBe(1); // a's first order was in September
    expect(figures.cur.top.map(b => b.title)).toEqual(["Riso Book", "Zine <One>"]);
    expect(figures.traffic.visits).toBe(100);
    expect(subject).toBe("[WEEKLY] $90.00 · 2 orders last week");
    expect(html).toContain("Zine &lt;One&gt;");
    expect(html).not.toContain("$999");
    expect(html).toContain("2 paid orders have waited 3 days or more to ship");
  });

  it("says so plainly in a week without sales and takes off partial refunds", () => {
    const quiet = buildWeeklySummary({ orders: [], daily: [], week: lastWeek(MONDAY) });
    expect(quiet.subject).toBe("[WEEKLY] No sales last week");
    expect(quiet.html).not.toContain("Visits (shop counter)");
    const refunded = buildWeeklySummary({ orders: [order("a", "2026-10-13T15:00:00Z", { refundedAmountMinor: 1000, expectedAmountMinor: 3000 })], daily: [], week: lastWeek(MONDAY) });
    expect(refunded.figures.cur.revenue).toBe(20);
  });

  it("is on unless switched off", () => {
    expect(weeklySummaryEnabled({})).toBe(true);
    expect(weeklySummaryEnabled({ shopAlerts: { weeklySummary: false } })).toBe(false);
  });
});

const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const RANGE = { startDate: "2026-10-01", endDate: "2026-10-13", prevStartDate: "2026-09-18", prevEndDate: "2026-09-30" };
const deps = (fetchImpl, saved = {}) => ({
  readSettings: async () => saved, allow: async () => true, credentials: async () => ({ accessToken: "tok", email: "sa@example.iam.gserviceaccount.com" }),
  fetchImpl, projectId: "lmb-test-shop",
});

describe("Search Console", () => {
  it("picks the saved property, else the shop's own domain, else the only one", () => {
    const sites = [{ siteUrl: "https://other.example/" }, { siteUrl: "sc-domain:lyricalmyricalbooks.com" }];
    expect(pickSite("https://other.example/", sites)).toBe("https://other.example/");
    expect(pickSite("", sites)).toBe("sc-domain:lyricalmyricalbooks.com");
    expect(pickSite("", [{ siteUrl: "https://only.example/" }])).toBe("https://only.example/");
    expect(pickSite("", [{ siteUrl: "https://a.example/" }, { siteUrl: "https://b.example/" }])).toBeNull();
    expect(cleanSite("javascript:alert(1)")).toBe("");
  });

  it("explains the setup steps in plain words", () => {
    expect(scErrorMessage(403, { error: { message: "Search Console API has not been used in project 1 before or it is disabled." } }).code).toBe("api_disabled");
    expect(scErrorMessage(403, { error: { message: "User does not have sufficient permission for site" } }, "sa@x").error).toContain("sa@x");
  });

  it("reports the shop's searches with both windows", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      if (url.endsWith("/sites")) return reply(200, { siteEntry: [{ siteUrl: "sc-domain:lyricalmyricalbooks.com", permissionLevel: "siteRestrictedUser" }] });
      const body = JSON.parse(init.body);
      if (!body.dimensions) return reply(200, { rows: [{ clicks: body.startDate === RANGE.startDate ? 12 : 6, impressions: 300, ctr: 0.04, position: 8.2 }] });
      return reply(200, { rows: [{ keys: [body.dimensions[0] === "query" ? "riso zine" : "https://lyricalmyricalbooks.com/books/x"], clicks: 5, impressions: 40, ctr: 0.125, position: 3.1 }] });
    };
    const { status, body } = await handleSearchConsole({ op: "report", range: RANGE }, deps(fetchImpl));
    expect(status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.site).toBe("sc-domain:lyricalmyricalbooks.com");
    expect(body.report.totals.current.clicks).toBe(12);
    expect(body.report.totals.previous.clicks).toBe(6);
    expect(body.report.queries[0]).toEqual({ key: "riso zine", clicks: 5, impressions: 40, ctr: 12.5, position: 3.1 });
    expect(calls.some(c => c.url.includes(encodeURIComponent("sc-domain:lyricalmyricalbooks.com")))).toBe(true);
  });

  it("asks for the service account to be added when Google lists no property", async () => {
    const { body } = await handleSearchConsole({ op: "status" }, deps(async () => reply(200, {})));
    expect(body.connected).toBe(false);
    expect(body.code).toBe("no_access");
    expect(body.error).toContain("sa@example.iam.gserviceaccount.com");
  });

  it("refuses a bad range and too many requests", async () => {
    const fetchImpl = async () => reply(200, { siteEntry: [{ siteUrl: "sc-domain:lyricalmyricalbooks.com", permissionLevel: "siteOwner" }] });
    expect((await handleSearchConsole({ op: "report", range: { startDate: "x" } }, deps(fetchImpl))).status).toBe(400);
    expect((await handleSearchConsole({ op: "report", range: RANGE }, { ...deps(fetchImpl), allow: async () => false })).status).toBe(429);
  });

  it("checks whether book pages are in Google's index", async () => {
    const asked = [];
    const fetchImpl = async (url, init) => {
      if (url.endsWith("/sites")) return reply(200, { siteEntry: [{ siteUrl: "sc-domain:lyricalmyricalbooks.com", permissionLevel: "siteRestrictedUser" }] });
      const body = JSON.parse(init.body);
      asked.push(body);
      if (body.inspectionUrl.endsWith("/hound")) return reply(200, { inspectionResult: { inspectionResultLink: "https://search.google.com/search-console/inspect?x=1", indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed", lastCrawlTime: "2026-10-17T10:00:00Z" } } });
      return reply(200, { inspectionResult: { inspectionResultLink: "javascript:alert(1)", indexStatusResult: { verdict: "NEUTRAL", coverageState: "Discovered - currently not indexed" } } });
    };
    const urls = ["https://lyricalmyricalbooks.com/books/hound", "https://www.lyricalmyricalbooks.com/books/tempo"];
    const { body } = await handleSearchConsole({ op: "inspect", urls }, deps(fetchImpl));
    expect(asked.map(a => a.siteUrl)).toEqual(["sc-domain:lyricalmyricalbooks.com", "sc-domain:lyricalmyricalbooks.com"]);
    expect(body.results[0]).toMatchObject({ verdict: "PASS", coverageState: "Submitted and indexed", link: "https://search.google.com/search-console/inspect?x=1" });
    expect(body.results[1]).toMatchObject({ verdict: "NEUTRAL", link: "" });
    expect(body.sitemapsUrl).toContain(encodeURIComponent("sc-domain:lyricalmyricalbooks.com"));
    const outside = await handleSearchConsole({ op: "inspect", urls: ["https://evil.example/books/x"] }, deps(fetchImpl));
    expect(outside.body.code).toBe("outside_site");
    expect((await handleSearchConsole({ op: "inspect", urls: [] }, deps(fetchImpl))).status).toBe(400);
  });

  it("says what to do when Google refuses every inspection", async () => {
    const fetchImpl = async url => (url.endsWith("/sites")
      ? reply(200, { siteEntry: [{ siteUrl: "sc-domain:lyricalmyricalbooks.com", permissionLevel: "siteRestrictedUser" }] })
      : reply(403, { error: { message: "User does not have sufficient permission for site" } }));
    const { body } = await handleSearchConsole({ op: "inspect", urls: ["https://lyricalmyricalbooks.com/books/a"] }, deps(fetchImpl));
    expect(body.connected).toBe(false);
    expect(body.code).toBe("no_access");
  });
});
