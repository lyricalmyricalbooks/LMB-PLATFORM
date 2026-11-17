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
    limit: () => ({
      async get() {
        read.push(path);
        const rows = Object.entries(docs).filter(([k]) => k.startsWith(`${path}/`) && k.split("/").length === path.split("/").length + 1);
        return { docs: rows.map(([k, d]) => ({ id: k.split("/").pop(), data: () => d })) };
      },
    }),
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

describe("each person's own calendar link", () => {
  const PERSON = "d".repeat(48);
  const team = () => shop({
    "shops/s1/bookingFeed/p-ana": { token: PERSON, staffId: "ana", staffName: "Ana" },
    "shops/s1/bookings/booking1": { status: "confirmed", serviceName: "Cut", staffId: "ana", staffName: "Ana", roomName: "Chair 1", start: "2026-11-20T15:00:00Z", end: "2026-11-20T15:30:00Z", customer: { name: "Ada" } },
    "shops/s1/bookings/booking3": { status: "confirmed", serviceName: "Colour", staffId: "ben", staffName: "Ben", start: "2026-11-20T16:00:00Z", end: "2026-11-20T17:00:00Z", customer: { name: "Cy" } },
  });

  test("lists only that person's bookings, named for them, with the room", async () => {
    const ics = await bookingsFeed({ db: rootDb(team()).db, shopId: "s1", token: PERSON, shopName: "Test Studio", nowMs: Date.parse("2026-11-14T12:00:00Z") });
    expect(ics).toMatch(/X-WR-CALNAME:Test Studio bookings · Ana/);
    expect(ics).toMatch(/SUMMARY:Ada: Cut/);
    expect(ics).toMatch(/LOCATION:Chair 1/);
    expect(ics).not.toMatch(/Colour|\(Ana\)/);
  });

  test("the owner's link still lists everyone, with each person's name", async () => {
    const ics = await bookingsFeed({ db: rootDb(team()).db, shopId: "s1", token: TOKEN, nowMs: Date.parse("2026-11-14T12:00:00Z") });
    expect(ics).toMatch(/SUMMARY:Ada: Cut \(Ana\)/);
    expect(ics).toMatch(/SUMMARY:Cy: Colour \(Ben\)/);
  });

  test("a person's link with no person on it answers nothing", async () => {
    const db = rootDb(shop({ "shops/s1/bookingFeed/p-x": { token: PERSON } })).db;
    expect(await bookingsFeed({ db, shopId: "s1", token: PERSON })).toBeNull();
  });
});

describe("a course in the calendars", () => {
  const course = (extra = {}) => shop({ ...extra,
    "shops/s1/bookings/booking5": {
      status: "confirmed", serviceName: "Wheel course", staffName: "Ana", start: "2026-11-28T23:00:00Z", end: "2026-11-29T01:00:00Z", gapAfter: 30,
      customer: { name: "Oz" }, manageKeyHash: hash(KEY),
      staffId: "ana", course: { starts: ["2026-11-28T23:00:00Z", "2026-12-05T23:00:00Z"], days: ["2026-11-28", "2026-12-05"], staff: ["Ana", "Ben"], staffIds: ["ana", "ben"] },
    },
  });

  test("the owner's feed has every date, with that date's person and no tidy-up time", async () => {
    const ics = await bookingsFeed({ db: rootDb(course()).db, shopId: "s1", token: TOKEN, nowMs: Date.parse("2026-11-14T12:00:00Z") });
    expect(ics).toMatch(/SUMMARY:Oz: Wheel course \(Ana\)/);
    expect(ics).toMatch(/SUMMARY:Oz: Wheel course \(Ben\)/);
    expect(ics).toMatch(/DTSTART:20261205T230000Z\r\nDTEND:20261206T010000Z/);
    expect(ics).toMatch(/UID:booking5@bookings/);
    expect(ics).toMatch(/UID:booking5-2@bookings/);
  });

  test("each person's own link has only the dates they take", async () => {
    const db = rootDb(course({ "shops/s1/bookingFeed/p-ben": { token: "e".repeat(48), staffId: "ben", staffName: "Ben" } })).db;
    const ics = await bookingsFeed({ db, shopId: "s1", token: "e".repeat(48), nowMs: Date.parse("2026-11-14T12:00:00Z") });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toMatch(/DTSTART:20261205T230000Z/);
  });

  test("the customer's file has every date too", async () => {
    const ics = await customerBookingIcs({ db: rootDb(course()).db, shopId: "s1", id: "booking5", key: KEY, shopName: "Test Press" });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toMatch(/DTSTART:20261128T230000Z/);
    expect(ics).toMatch(/DTSTART:20261205T230000Z/);
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
