// Bookings calendars (bookings.js bookingsFeed / customerBookingIcs, frontDoor.js): the owner's private feed and the
// customer's one-booking file answer only the right link, only with Bookings on, and read only that shop's folder.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire(import.meta.url);
const { bookingsFeed, customerBookingIcs } = require("./bookings");
const { frontDoor, CALENDAR_PATH, BOOKING_CALENDAR_PATH } = require("./frontDoor");

const TOKEN = "a".repeat(48);
const KEY = "b".repeat(48);
const hash = (k) => crypto.createHash("sha256").update(k).digest("hex");

function rootDb(docs) {
  const read = [];
  const col = (path) => ({
    doc: (id) => ({
      collection: (c) => col(`${path}/${id}/${c}`),
      async get() { read.push(`${path}/${id}`); const d = docs[`${path}/${id}`]; return { exists: !!d, data: () => d }; },
    }),
    where: (f, op, v) => ({
      limit: () => ({
        async get() {
          read.push(path);
          const rows = Object.entries(docs).filter(([k, d]) => k.startsWith(`${path}/`) && k.split("/").length === path.split("/").length + 1 && (op === "in" ? v.includes(d[f]) : d[f] === v));
          return { docs: rows.map(([k, d]) => ({ id: k.split("/").pop(), data: () => d })) };
        },
      }),
    }),
  });
  return { db: { collection: (c) => col(c) }, read };
}

const shop = (extra = {}) => ({
  "shops/s1/platform/features": { bookings: true },
  "shops/s1/bookingFeed/main": { token: TOKEN },
  "shops/s1/bookings/booking1": { status: "confirmed", serviceName: "Studio visit", start: "2026-11-20T15:00:00Z", end: "2026-11-20T15:30:00Z", customer: { name: "Ada", email: "ada@example.com" }, location: "Print room", manageKeyHash: hash(KEY) },
  "shops/s1/bookings/booking2": { status: "cancelled", serviceName: "Gone", start: "2026-11-21T15:00:00Z", end: "2026-11-21T15:30:00Z", customer: { name: "Bo" } },
  "shops/s2/bookings/bk9": { status: "confirmed", serviceName: "Other shop", start: "2026-11-20T15:00:00Z", end: "2026-11-20T16:00:00Z", customer: { name: "Zed" } },
  ...extra,
});

describe("the owner's calendar feed", () => {
  test("lists this shop's live bookings, named for the shop", async () => {
    const { db, read } = rootDb(shop());
    const ics = await bookingsFeed({ db, shopId: "s1", token: TOKEN, shopName: "Test Press", nowMs: Date.parse("2026-11-14T12:00:00Z") });
    expect(ics).toMatch(/X-WR-CALNAME:Test Press bookings/);
    expect(ics).toMatch(/SUMMARY:Ada: Studio visit/);
    expect(ics).not.toMatch(/Gone|Other shop/);
    expect(read.every((p) => p.startsWith("shops/s1/"))).toBe(true);
  });

  test("a wrong link or Bookings turned off answers nothing", async () => {
    expect(await bookingsFeed({ db: rootDb(shop()).db, shopId: "s1", token: "c".repeat(48) })).toBeNull();
    expect(await bookingsFeed({ db: rootDb(shop({ "shops/s1/platform/features": {} })).db, shopId: "s1", token: TOKEN })).toBeNull();
    expect(await bookingsFeed({ db: rootDb(shop()).db, shopId: "s1", token: "not-a-token" })).toBeNull();
  });
});

describe("the customer's calendar file", () => {
  test("opens with the customer's key, never for a cancelled booking or a wrong key", async () => {
    const { db } = rootDb(shop());
    expect(await customerBookingIcs({ db, shopId: "s1", id: "booking1", key: KEY, shopName: "Test Press" })).toMatch(/SUMMARY:Studio visit · Test Press/);
    expect(await customerBookingIcs({ db, shopId: "s1", id: "booking1", key: "c".repeat(48) })).toBeNull();
    expect(await customerBookingIcs({ db, shopId: "s1", id: "booking2", key: KEY })).toBeNull();
  });
});

describe("the front door's calendar addresses", () => {
  test("match only the two calendar shapes", () => {
    expect(CALENDAR_PATH.test(`/calendar/${TOKEN}.ics`)).toBe(true);
    expect(BOOKING_CALENDAR_PATH.exec(`/calendar/b/bk1abc/${KEY}.ics`)?.slice(1)).toEqual(["bk1abc", KEY]);
    expect(CALENDAR_PATH.test("/calendar/short.ics")).toBe(false);
  });

  test("answers the feed as a calendar, and a dead link in plain words", async () => {
    const answer = frontDoor({
      rootDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ shopId: "s1" }) }) }) }) }),
      bucket: () => ({}), loadShop: async () => ({ id: "s1", status: "open", record: {} }), shellUrl: () => "",
      calendarFeed: async (s, token) => (token === TOKEN ? "BEGIN:VCALENDAR" : null), usage: () => {},
    });
    const res = () => { const r = { headers: {} }; r.status = (c) => ((r.code = c), r); r.set = (k, v) => ((r.headers[k] = v), r); r.send = (b) => ((r.body = b), r); return r; };
    const ok = await answer({ method: "GET", path: `/calendar/${TOKEN}.ics`, headers: { host: "shop.example" }, get: () => "shop.example" }, res());
    expect([ok.code, ok.headers["Content-Type"]]).toEqual([200, "text/calendar; charset=utf-8"]);
    const gone = await answer({ method: "GET", path: `/calendar/${"d".repeat(48)}.ics`, headers: { host: "shop.example" }, get: () => "shop.example" }, res());
    expect(gone.code).toBe(404);
  });
});
