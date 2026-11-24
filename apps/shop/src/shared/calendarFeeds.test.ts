// Busy times from Outlook, Apple and other calendars (plan 4, 5.7). Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./calendarFeeds";

const server = createRequire(import.meta.url)("../../functions/shared/calendarFeeds.js") as typeof shop;
const ZONE = "America/Toronto";
const ics = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e.trim().split("\n").map((l) => l.trim()), "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const iso = (spans: Array<{ s: number; e: number }>) => spans.map((x) => `${new Date(x.s).toISOString()}/${new Date(x.e).toISOString()}`);
const FROM = Date.parse("2026-11-16T05:00:00Z");
const TO = Date.parse("2026-12-16T05:00:00Z");

describe.each([["shop", shop], ["server", server]] as const)("other calendars (%s copy)", (_name, c) => {
  test("addresses: Outlook, Apple and the others are read; webcal becomes https; anything else is refused", () => {
    expect(c.cleanFeedUrl("webcal://p42-caldav.icloud.com/published/2/abc")).toEqual({ url: "https://p42-caldav.icloud.com/published/2/abc", kind: "apple" });
    expect(c.cleanFeedUrl("https://outlook.office365.com/owa/calendar/x/y/calendar.ics")).toMatchObject({ kind: "outlook" });
    expect(c.cleanFeedUrl("https://calendar.google.com/calendar/ical/a/private-b/basic.ics")).toMatchObject({ kind: "google" });
    for (const bad of ["", "not a link", "http://outlook.live.com/a.ics", "https://evil.example/a.ics", "https://169.254.169.254/x", `https://user:pw${"@"}outlook.live.com/a`, "https://outlook.live.com:8443/a", "https://icloud.com.evil.example/a"]) {
      expect(c.cleanFeedUrl(bad)).toHaveProperty("problem");
    }
    expect(c.feedHostAllowed("p01-caldav.icloud.com")).toBe(true);
    expect(c.feedHostAllowed("localhost")).toBe(false);
  });

  test("times in UTC, in a named zone, in Outlook's Windows zone and with no zone (the shop's)", () => {
    const text = ics(
      "UID:a\nDTSTART:20261118T150000Z\nDTEND:20261118T160000Z",
      "UID:b\nDTSTART;TZID=Europe/Paris:20261119T090000\nDTEND;TZID=Europe/Paris:20261119T100000",
      "UID:c\nDTSTART;TZID=Eastern Standard Time:20261120T090000\nDURATION:PT30M",
      "UID:d\nDTSTART:20261121T120000\nDTEND:20261121T130000",
    );
    expect(iso(c.busyFromIcs(text, FROM, TO, ZONE))).toEqual([
      "2026-11-18T15:00:00.000Z/2026-11-18T16:00:00.000Z",
      "2026-11-19T08:00:00.000Z/2026-11-19T09:00:00.000Z",
      "2026-11-20T14:00:00.000Z/2026-11-20T14:30:00.000Z",
      "2026-11-21T17:00:00.000Z/2026-11-21T18:00:00.000Z",
    ]);
  });

  test("free, cancelled and tentative-free events don't close time; all-day events close the shop's whole day", () => {
    const text = ics(
      "UID:a\nDTSTART:20261118T150000Z\nDTEND:20261118T160000Z\nTRANSP:TRANSPARENT",
      "UID:b\nDTSTART:20261118T170000Z\nDTEND:20261118T180000Z\nSTATUS:CANCELLED",
      "UID:c\nDTSTART:20261118T190000Z\nDTEND:20261118T200000Z\nX-MICROSOFT-CDO-BUSYSTATUS:FREE",
      "UID:d\nDTSTART;VALUE=DATE:20261125\nDTEND;VALUE=DATE:20261126",
    );
    expect(iso(c.busyFromIcs(text, FROM, TO, ZONE))).toEqual(["2026-11-25T05:00:00.000Z/2026-11-26T05:00:00.000Z"]);
  });

  test("a weekly repeat on two days keeps its clock across the time change, skips an EXDATE and a moved one", () => {
    const text = ics(
      "UID:w\nDTSTART;TZID=America/Toronto:20261026T090000\nDTEND;TZID=America/Toronto:20261026T100000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261125T235959Z\nEXDATE;TZID=America/Toronto:20261118T090000",
      "UID:w\nRECURRENCE-ID;TZID=America/Toronto:20261123T090000\nDTSTART;TZID=America/Toronto:20261123T140000\nDTEND;TZID=America/Toronto:20261123T150000",
    );
    expect(iso(c.busyFromIcs(text, FROM, TO, ZONE))).toEqual([
      "2026-11-16T14:00:00.000Z/2026-11-16T15:00:00.000Z",
      "2026-11-23T19:00:00.000Z/2026-11-23T20:00:00.000Z",
      "2026-11-25T14:00:00.000Z/2026-11-25T15:00:00.000Z",
    ]);
  });

  test("daily with a count, monthly on the first Tuesday, and overlaps joined", () => {
    const daily = ics("UID:d\nDTSTART:20261116T150000Z\nDTEND:20261116T160000Z\nRRULE:FREQ=DAILY;COUNT=3", "UID:o\nDTSTART:20261116T153000Z\nDTEND:20261116T170000Z");
    expect(iso(c.busyFromIcs(daily, FROM, TO, ZONE))).toEqual([
      "2026-11-16T15:00:00.000Z/2026-11-16T17:00:00.000Z",
      "2026-11-17T15:00:00.000Z/2026-11-17T16:00:00.000Z",
      "2026-11-18T15:00:00.000Z/2026-11-18T16:00:00.000Z",
    ]);
    const monthly = ics("UID:m\nDTSTART;TZID=America/Toronto:20261006T180000\nDTEND;TZID=America/Toronto:20261006T190000\nRRULE:FREQ=MONTHLY;BYDAY=1TU");
    expect(iso(c.busyFromIcs(monthly, FROM, TO, ZONE))).toEqual(["2026-12-01T23:00:00.000Z/2026-12-02T00:00:00.000Z"]);
  });

  test("folded lines are joined, and a sign-in page isn't a calendar", () => {
    const text = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:f\r\nDTSTART;TZID=Ame\r\n rica/Toronto:20261118T090000\r\nDTEND;TZID=America/Toronto:20261118T100000\r\nEND:VEVENT\r\nEND:VCALENDAR";
    expect(c.busyFromIcs(text, FROM, TO, ZONE)).toHaveLength(1);
    expect(c.looksLikeCalendar(text)).toBe(true);
    expect(c.looksLikeCalendar("<html><body>Sign in</body></html>")).toBe(false);
  });
});
