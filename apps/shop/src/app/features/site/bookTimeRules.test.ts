import { describe, expect, it } from "vitest";
import { firstOpenDay, groupTimes, lengthText, manageFromSearch, wantedFromSearch, sectionServices, monthLabel, pageDays, pageStep, paysUpFront, withCode, takesDeposit } from "./bookTimeRules";

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
    expect(wantedFromSearch("?service=svc_1&day=2026-11-21")).toEqual({ service: "svc_1", day: "2026-11-21", offer: "", offerKey: "" });
    expect(wantedFromSearch("?service=a/b&day=tomorrow")).toEqual({ service: "", day: "", offer: "", offerKey: "" });
    // A held place from the waiting list needs both parts, well formed.
    const offer = "a".repeat(32);
    const offerKey = "b".repeat(48);
    expect(wantedFromSearch(`?service=svc_1&day=2026-11-21&offer=${offer}&offerKey=${offerKey}`)).toMatchObject({ offer, offerKey });
    expect(wantedFromSearch(`?service=svc_1&offer=${offer}&offerKey=short`)).toMatchObject({ offer: "", offerKey: "" });
    expect(wantedFromSearch("")).toEqual({ service: "", day: "", offer: "", offerKey: "" });
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
