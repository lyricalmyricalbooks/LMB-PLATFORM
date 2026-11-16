// Who's coming on a day (bookingsView.dayList / dayListRows) and its printed page (bookingsDaySheet).
import { describe, it, expect } from "vitest";
import { dayList, dayListRows, daySlots } from "./bookingsView";
import { daySheetHtml } from "./bookingsDaySheet";
import type { Booking } from "./bookingsApi";

const ZONE = "America/Toronto";
const base = { currency: "CAD", sessions: [], createdAt: "", updatedAt: "", history: [], source: "website", minutes: 60, end: "" } as any;
const b = (id: string, over: Partial<Booking>): Booking => ({
  ...base, id, serviceId: "visit", serviceName: "Studio visit", start: "2026-11-20T15:00:00.000Z", status: "confirmed", payment: "free", priceMinor: 0, paid: false,
  customer: { name: id, email: `${id}@example.com`, phone: "" }, ...over,
});

const day = [
  b("cara", { serviceId: "class", serviceName: "Evening class", start: "2026-11-20T23:00:00.000Z", payment: "atShop", priceMinor: 3000, answers: [{ label: "Experience", answer: "None" }] }),
  b("ada", { customer: { name: "Ada", email: "ada@example.com", phone: "555 0100" }, note: "Bringing a friend" }),
  b("bo", { serviceId: "class", serviceName: "Evening class", start: "2026-11-20T23:00:00.000Z", status: "held", payment: "card", priceMinor: 3000, answers: [{ label: "Experience", answer: "Some" }, { label: "Size", answer: "" }] }),
  b("gone", { status: "cancelled" }),
];

describe("who's coming on a day", () => {
  it("groups people by start in time order, leaves out cancelled bookings and blank answers", () => {
    const groups = dayList(day, ZONE);
    expect(groups.map((g) => [g.time, g.serviceName, g.people.map((p) => p.id)])).toEqual([
      [expect.stringMatching(/10:00/), "Studio visit", ["ada"]],
      [expect.stringMatching(/6:00|18:00/), "Evening class", ["cara", "bo"]],
    ]);
    const ada = groups[0].people[0];
    expect(ada).toMatchObject({ name: "Ada", phone: "555 0100", note: "Bringing a friend", payment: "Free", tag: "" });
    const bo = groups[1].people[1];
    expect(bo.tag).toBe("Not confirmed yet");
    expect(bo.answers).toEqual([{ label: "Experience", answer: "Some" }]);
  });

  it("the spreadsheet has one column per question asked that day", () => {
    const rows = dayListRows(dayList(day, ZONE));
    expect(rows[0]).toEqual(["Time", "Service", "Name", "Phone", "Email", "Payment", "Note", "Experience"]);
    expect(rows).toHaveLength(4);
    expect(rows[3].slice(2)).toEqual(["bo", "", "bo@example.com", expect.stringContaining("(Not confirmed yet)"), "", "Some"]);
  });

  it("the printed page shows every person with a box to tick and escapes what customers typed", () => {
    const html = daySheetHtml(dayList([...day, b("eve", { customer: { name: "<b>Eve</b>", email: "eve@example.com", phone: "" } })], ZONE), { title: "Who's coming · Friday" });
    expect(html).toContain("4 people");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html.match(/class="tick"><i>/g)).toHaveLength(4);
  });

  it("a class card knows its service, so a person can be added to it", () => {
    const slots = daySlots(day.filter((x) => x.status !== "cancelled"), (id) => (id === "class" ? 8 : 1));
    expect(slots.find((s) => s.kind === "class")).toMatchObject({ serviceId: "class", places: 8 });
  });
});
