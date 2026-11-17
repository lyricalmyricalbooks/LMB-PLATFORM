import { describe, expect, it } from "vitest";
import { waySavedWords, waysShown } from "./WaysToSellCard";
import { WAYS, waysAllowed, waysIn, waysOn } from "../../shared/waysToSell";

describe("Settings › Ways to sell (beta)", () => {
  it("shows nothing until the platform turns a way on, then only those ways, in order", () => {
    expect(waysShown([])).toEqual([]);
    expect(waysShown(waysAllowed({ ways: { rentals: true, events: true, classes: false } })).map((w) => w.id)).toEqual(["events", "rentals"]);
    expect(waysShown(["books"])).toEqual([]);
  });
  it("a way is on only when the platform allows it and the owner switched it on", () => {
    expect(waysOn({ ways: { events: true, digital: true } }, { ways: { events: true, rentals: true } })).toEqual(["events"]);
    expect(waysOn({ ways: { events: true } }, { ways: { events: false } })).toEqual([]);
    expect(waysOn(null, { ways: { events: true } })).toEqual([]);
    expect(waysIn({ events: "yes", giving: true } as never)).toEqual(["giving"]);
  });
  it("says plainly that switching off keeps the work", () => {
    expect(waySavedWords(WAYS[0], true)).toBe("Events & tickets is on.");
    expect(waySavedWords(WAYS[0], false)).toMatch(/is off\. Everything you made with it is kept\./);
  });
  it("lists six ways with a plain line each", () => {
    expect(WAYS.map((w) => w.id)).toEqual(["events", "classes", "digital", "giving", "memberships", "rentals"]);
    for (const way of WAYS) expect(way.line.endsWith(".")).toBe(true);
  });
});
