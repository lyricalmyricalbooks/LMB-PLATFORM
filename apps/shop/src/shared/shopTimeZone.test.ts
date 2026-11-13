// The shop's day follows the shop's own time zone (tasks/todo/2026-11-13-us-shops.md, update E).
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SHOP_TIME_ZONE, setShopTimeZoneSource, shopCalendarDay, shopTimeZone, shopTimeZoneOf } from "./shopTimeZone";
import { shopDate } from "./preorder";

afterEach(() => setShopTimeZoneSource());

describe("the shop's time zone", () => {
  it("is Eastern time unless the shop names a real zone", () => {
    expect(shopTimeZone()).toBe(DEFAULT_SHOP_TIME_ZONE);
    expect(shopTimeZoneOf("America/Los_Angeles")).toBe("America/Los_Angeles");
    for (const bad of ["Pacific time", "America/Nowhere_At_All", "", null, 5, "../etc"]) expect(shopTimeZoneOf(bad)).toBe("America/Toronto");
  });
  it("moves the shop's day: 1am in Toronto is still yesterday in Los Angeles", () => {
    const at = new Date("2026-11-14T06:00:00Z");
    expect(shopDate(at)).toBe("2026-11-14");
    setShopTimeZoneSource(() => "America/Los_Angeles");
    expect(shopDate(at)).toBe("2026-11-13");
    expect(shopCalendarDay(at)).toBe("2026-11-13");
  });
  it("a source that throws reads as Eastern time", () => {
    setShopTimeZoneSource(() => { throw new Error("no shop"); });
    expect(shopTimeZone()).toBe("America/Toronto");
  });
});
