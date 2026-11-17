import { describe, expect, it } from "vitest";
import { bookWithHref, clockText, directionsUrl, hoursRows, menuServices, personWords, servicesFor, teamRows } from "./serviceSections";
import type { BookingInfo, BookingServiceView } from "./bookTimeRules";

const svc = (id: string, name: string): BookingServiceView => ({ id, name, description: "", minutes: 60, priceMinor: 5000, payment: "card", location: "" } as BookingServiceView);
const info: BookingInfo = {
  on: true, today: "2026-11-17",
  services: [svc("cut", "Cut"), svc("colour", "Colour"), svc("trim", "Trim")],
  staff: [{ id: "ana", name: "Ana", serviceIds: [] }, { id: "ben", name: "Ben", serviceIds: ["colour", "gone"] }],
};

describe("service sections", () => {
  it("lists services only while bookings are on", () => {
    expect(menuServices(info).map((s) => s.id)).toEqual(["cut", "colour", "trim"]);
    expect(menuServices({ on: false })).toEqual([]);
    expect(menuServices(null)).toEqual([]);
  });

  it("names what each person does, dropping services that are gone", () => {
    expect(teamRows(info).map((p) => [p.name, p.services])).toEqual([["Ana", []], ["Ben", ["Colour"]]]);
    expect(teamRows({ on: true })).toEqual([]);
  });

  it("puts the name into a person's button", () => {
    expect(personWords("Book with {name}", "Ana")).toBe("Book with Ana");
    expect(personWords("Book", "Ana")).toBe("Book");
  });

  it("writes the week Monday first, closed days empty, today marked", () => {
    const hours = [[], [{ start: "09:00", end: "17:00" }], [], [], [], [], [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "16:30" }]];
    const rows = hoursRows(hours, "2026-11-17", "en-CA");
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0].day).toBe("Monday");
    expect(rows[6].day).toBe("Sunday");
    expect(rows[0].windows).toEqual([`${clockText("09:00", "en-CA")} – ${clockText("17:00", "en-CA")}`]);
    expect(rows[5].windows).toHaveLength(2);
    expect(rows[6].windows).toEqual([]);
    // 17 November 2026 is a Tuesday.
    expect(rows.filter((r) => r.today).map((r) => r.weekday)).toEqual([2]);
    expect(hoursRows(undefined)).toEqual([]);
    expect(hoursRows([[]])).toEqual([]);
  });

  it("writes clock times the visitor's way", () => {
    expect(clockText("09:00", "en-US")).toMatch(/^9:00\s?AM$/);
    expect(clockText("17:30", "en-GB")).toBe("17:30");
    expect(clockText("nope")).toBe("nope");
  });

  it("links to directions and to booking with someone", () => {
    expect(directionsUrl(" 1 Main St, Toronto ")).toBe("https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St%2C%20Toronto");
    expect(bookWithHref("a b")).toBe("/book?with=a%20b");
  });

  it("offers only the services a picked person does", () => {
    expect(servicesFor(info, "ben").map((s) => s.id)).toEqual(["colour"]);
    expect(servicesFor(info, "ana")).toHaveLength(3);
    expect(servicesFor(info, "nobody")).toHaveLength(3);
  });
});
