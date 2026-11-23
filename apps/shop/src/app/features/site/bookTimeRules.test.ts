import { describe, expect, it } from "vitest";
import { firstOpenDay, groupTimes, lengthText, manageFromSearch, wantedFromSearch, sectionServices, monthLabel, pageDays, pageStep, paysUpFront, withCode, takesDeposit, peopleFor, asPerson, ratesDiffer, withPicked, showNoteBox, cardPrice } from "./bookTimeRules";

const ZONE = "America/Toronto";

describe("Book a time page rules", () => {
  it("shows a week at a time, never past the last bookable day", () => {
    expect(pageDays("2026-11-16", "2026-12-31")).toHaveLength(7);
    expect(pageDays("2026-11-16", "2026-11-18")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
  it("moves a page back and forward within the bookable days", () => {
    expect(pageStep("2026-11-16", "2026-11-16", "2026-12-31", -1)).toBeNull();
    expect(pageStep("2026-11-20", "2026-11-16", "2026-12-31", -1)).toBe("2026-11-16");
    expect(pageStep("2026-11-23", "2026-11-16", "2026-12-31", -1)).toBe("2026-11-16");
    expect(pageStep("2026-11-16", "2026-11-16", "2026-12-31", 1)).toBe("2026-11-23");
    expect(pageStep("2026-11-16", "2026-11-16", "2026-11-20", 1)).toBeNull();
  });
  it("opens on the first day with a free time", () => {
    expect(firstOpenDay(["a", "b", "c"], { a: [], b: ["x"] })).toBe("b");
    expect(firstOpenDay(["a", "b"], {})).toBe("a");
  });
  it("groups times by the shop's morning, afternoon and evening", () => {
    const groups = groupTimes(["2026-11-17T15:00:00.000Z", "2026-11-17T18:30:00.000Z", "2026-11-17T22:00:00.000Z"], ZONE);
    expect(groups.map((g) => [g.group, g.times.length])).toEqual([["morning", 1], ["afternoon", 1], ["evening", 1]]);
    expect(groupTimes([], ZONE)).toEqual([]);
  });
  it("says how long and how it's paid", () => {
    expect(lengthText(45)).toBe("45 min");
    expect(lengthText(60)).toBe("1 h");
    expect(lengthText(90)).toBe("1 h 30 min");
    expect(paysUpFront({ payment: "full", priceMinor: 0 })).toBe(false);
    expect(paysUpFront({ payment: "full", priceMinor: 2500 })).toBe(true);
  });
  it("names the month or months shown", () => {
    expect(monthLabel(["2026-11-16", "2026-11-22"])).toMatch(/November 2026/);
    expect(monthLabel(["2026-11-30", "2026-12-06"])).toMatch(/Nov.*Dec.*2026/);
  });
  it("reads only a well-formed manage link", () => {
    const key = "a".repeat(48);
    expect(manageFromSearch(`?booking=abc12345&key=${key}`)).toEqual({ id: "abc12345", key });
    expect(manageFromSearch(`?booking=abc12345&key=short`)).toBeNull();
    expect(manageFromSearch("")).toBeNull();
  });
  it("reads the service and day a waiting-list email links to, and drops anything misshapen", () => {
    expect(wantedFromSearch("?service=svc_1&day=2026-11-21")).toEqual({ service: "svc_1", day: "2026-11-21", offer: "", offerKey: "", person: "" });
    expect(wantedFromSearch("?with=ana").person).toBe("ana");
    expect(wantedFromSearch("?with=a/b").person).toBe("");
    expect(wantedFromSearch("?service=a/b&day=tomorrow")).toEqual({ service: "", day: "", offer: "", offerKey: "", person: "" });
    // A held place from the waiting list needs both parts, well formed.
    const offer = "a".repeat(32);
    const offerKey = "b".repeat(48);
    expect(wantedFromSearch(`?service=svc_1&day=2026-11-21&offer=${offer}&offerKey=${offerKey}`)).toMatchObject({ offer, offerKey });
    expect(wantedFromSearch(`?service=svc_1&offer=${offer}&offerKey=short`)).toMatchObject({ offer: "", offerKey: "" });
    expect(wantedFromSearch("")).toEqual({ service: "", day: "", offer: "", offerKey: "", person: "" });
  });
  it("gives a Book a time section the first few services, and none while bookings are off", () => {
    const service = (id: string) => ({ id, name: id, description: "", minutes: 30, priceMinor: 0, payment: "free" as const, location: "" });
    const info = { on: true, services: ["a", "b", "c", "d"].map(service) } as any;
    expect(sectionServices(info, 2).map((s) => s.id)).toEqual(["a", "b"]);
    expect(sectionServices(info, "nonsense")).toHaveLength(3);
    expect(sectionServices(info, 99)).toHaveLength(4);
    expect(sectionServices({ on: false } as any, 3)).toEqual([]);
    expect(sectionServices(null, 3)).toEqual([]);
  });

  it("prices a service after a discount code, deposit included", () => {
    const visit = { id: "v", name: "V", description: "", minutes: 60, priceMinor: 14000, payment: "deposit" as const, depositPercent: 25, location: "" };
    expect(withCode(visit, null)).toBe(visit);
    const priced = withCode(visit, { code: "SPRING", discountMinor: 2800, priceMinor: 11200, payNowMinor: 2800 });
    expect(priced).toMatchObject({ priceMinor: 11200, depositMinor: 2800, depositPercent: 0 });
    expect(takesDeposit(priced)).toBe(true);
    const full = { ...visit, payment: "full" as const };
    expect(withCode(full, { code: "X", discountMinor: 1000, priceMinor: 13000, payNowMinor: 13000 })).toEqual({ ...full, priceMinor: 13000 });
  });
});

describe("tip choices on the booking page", () => {
  it("turns a pick into cents and checks it against the limit", async () => {
    const { tipMinorOf, tipOk } = await import("./bookTimeRules");
    expect(tipMinorOf({ kind: "percent", percent: 18 }, 12500)).toBe(2250);
    expect(tipMinorOf({ kind: "none" }, 12500)).toBe(0);
    expect([tipMinorOf({ kind: "other", text: "12.5" }, 0), tipMinorOf({ kind: "other", text: "" }, 0), tipMinorOf({ kind: "other", text: "$7" }, 0)]).toEqual([1250, 0, 700]);
    expect([tipOk(0, 10000), tipOk(0, 10000, true), tipOk(49, 10000), tipOk(10000, 10000), tipOk(10001, 10000)]).toEqual([true, false, false, true, false]);
  });
});

describe("the With picker", () => {
  it("offers only the people who do the service, and nobody when the shop lists nobody", () => {
    const staff = [{ id: "ana", name: "Ana", serviceIds: [] }, { id: "ben", name: "Ben", serviceIds: ["riso"] }, { id: "cy", name: "Cy", serviceIds: ["tour"] }];
    expect(peopleFor({ staff }, "riso").map((p) => p.id)).toEqual(["ana", "ben"]);
    expect(peopleFor({ staff }, "tour").map((p) => p.id)).toEqual(["ana", "cy"]);
    expect(peopleFor({}, "riso")).toEqual([]);
    expect(peopleFor(null, "riso")).toEqual([]);
  });
});

describe("prices by person", () => {
  const cut = { id: "cut", name: "Cut", description: "", minutes: 45, priceMinor: 6000, payment: "full" as const, location: "", taxMinor: 780, extras: [{ id: "x", name: "Long hair", minutes: 15, priceMinor: 1500 }] };
  const riya = { id: "riya", name: "Riya", serviceIds: [], rates: [{ serviceId: "cut", minutes: 60, priceMinor: 7500 }] };
  const sam = { id: "sam", name: "Sam", serviceIds: [] };
  it("uses the person's own length and price, with the tax in step", () => {
    expect(asPerson(cut, riya)).toMatchObject({ minutes: 60, priceMinor: 7500, taxMinor: 975 });
    expect(asPerson(cut, sam)).toBe(cut);
    expect(asPerson(cut, null)).toBe(cut);
  });
  it("puts the ticked extras on top of the person's price", () => {
    expect(withPicked(asPerson(cut, riya), ["x"])).toMatchObject({ minutes: 75, priceMinor: 9000 });
  });
  it("never changes a class, a course or a free service's price", () => {
    expect(asPerson({ ...cut, places: 6 }, riya).priceMinor).toBe(6000);
    expect(asPerson({ ...cut, courseStarts: ["2026-12-01T10:00:00.000Z"] }, riya).minutes).toBe(45);
    expect(asPerson({ ...cut, payment: "free" as const, priceMinor: 0, taxMinor: 0 }, riya)).toMatchObject({ minutes: 60, priceMinor: 0 });
  });
  it("tells when anyone has their own", () => {
    expect(ratesDiffer(cut, [sam, riya])).toBe(true);
    expect(ratesDiffer(cut, [sam])).toBe(false);
  });
});

describe("tax on a picked visit", () => {
  it("rounds once on the whole amount, as the server does", () => {
    const s = { id: "s", name: "S", description: "", minutes: 30, priceMinor: 104, payment: "full" as const, location: "", taxMinor: 14, taxPpm: 130000, extras: [{ id: "x", name: "X", minutes: 0, priceMinor: 104 }] };
    expect(withPicked(s, ["x"]).taxMinor).toBe(27);
    expect(asPerson(s, { id: "p", name: "P", serviceIds: [], rates: [{ serviceId: "s", minutes: null, priceMinor: 208 }] }).taxMinor).toBe(27);
  });
});

describe("showNoteBox", () => {
  const note = "Anything we should know? (optional)";
  it("hides the note box when a question asks the same thing", () => {
    expect(showNoteBox([{ label: "Anything we should know?" }], note)).toBe(false);
    expect(showNoteBox([{ label: "anything we should KNOW" }], note)).toBe(false);
  });
  it("keeps it for other questions or none", () => {
    expect(showNoteBox([], note)).toBe(true);
    expect(showNoteBox([{ label: "Hair length?" }], note)).toBe(true);
    expect(showNoteBox([{ label: "" }], "")).toBe(true);
  });
});

describe("prices on service cards (plan 4, 2.3)", () => {
  const base = { id: "cut", name: "Cut", description: "", minutes: 45, priceMinor: 4000, payment: "atShop" as const, location: "" };
  it("says From the cheapest length", () => {
    expect(cardPrice({ ...base, lengths: [{ id: "a", name: "", minutes: 30, priceMinor: 3000 }, { id: "b", name: "", minutes: 60, priceMinor: 5000 }] })).toEqual({ minor: 3000, from: true });
  });
  it("says From when the people who do it charge different amounts, and the plain price when they don't", () => {
    const junior = { id: "j", name: "Jo", serviceIds: [], rates: [{ serviceId: "cut", priceMinor: 3500 }] };
    const senior = { id: "s", name: "Sam", serviceIds: [], rates: [{ serviceId: "cut", priceMinor: 5500 }] };
    expect(cardPrice(base, [junior, senior])).toEqual({ minor: 3500, from: true });
    expect(cardPrice(base, [{ id: "x", name: "Al", serviceIds: [] }])).toEqual({ minor: 4000, from: false });
    expect(cardPrice(base)).toEqual({ minor: 4000, from: false });
  });
});

describe("team on the booking page (plan 4, 2.4)", () => {
  const staff = [{ id: "ana", name: "Ana", serviceIds: [], photo: "https://example.com/a.jpg", bio: "Hi" }];
  it("offers people to pick unless the shop books anyone available", () => {
    expect(peopleFor({ staff }, "x").map((p) => p.id)).toEqual(["ana"]);
    expect(peopleFor({ staff, staffPick: false }, "x")).toEqual([]);
  });
});

describe("times on the client's own clock (plan 4, 2.9)", () => {
  it("adds the weekday only when the time falls on another day there", async () => {
    const { slotText } = await import("./bookTimeRules");
    const evening = "2026-11-18T01:30:00Z"; // 8:30 PM Tuesday in Toronto, 1:30 AM Wednesday in London
    expect(slotText(evening, "America/Toronto", "America/Toronto")).not.toMatch(/Wed|Tue/);
    expect(slotText(evening, "Europe/London", "America/Toronto")).toMatch(/Wed/);
    expect(slotText("2026-11-17T15:00:00Z", "Europe/London", "America/Toronto")).not.toMatch(/Tue|Wed/);
  });
});
