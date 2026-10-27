import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { MAX_LIVE_RATE_EXTRA, liveRateExtra, withLiveRateExtra, cleanLiveRateExtra } = require("./liveRateExtra.js");

describe("extra amount on live carrier rates", () => {
  it("adds nothing unless switched on with a positive amount", () => {
    expect(liveRateExtra({})).toBe(0);
    expect(liveRateExtra({ liveRateExtra: { enabled: false, amount: 1 } })).toBe(0);
    expect(liveRateExtra({ liveRateExtra: { enabled: true, amount: 0 } })).toBe(0);
    expect(liveRateExtra({ liveRateExtra: { enabled: true, amount: "x" } })).toBe(0);
    expect(liveRateExtra({ liveRateExtra: { enabled: true, amount: 1 } })).toBe(1);
    expect(liveRateExtra({ liveRateExtra: { enabled: true, amount: 999 } })).toBe(MAX_LIVE_RATE_EXTRA);
  });
  it("adds to the carrier price in whole cents", () => {
    expect(withLiveRateExtra(12.34, 1)).toBe(13.34);
    expect(withLiveRateExtra(0.1, 0.2)).toBe(0.3);
    expect(withLiveRateExtra(9.99, 0)).toBe(9.99);
  });
  it("checks what the admin saves", () => {
    expect(cleanLiveRateExtra(undefined)).toBeNull();
    expect(cleanLiveRateExtra({ enabled: true, amount: "1.256" })).toEqual({ enabled: true, amount: 1.26 });
    expect(cleanLiveRateExtra({ enabled: "yes", amount: 2 })).toEqual({ enabled: false, amount: 2 });
    expect(() => cleanLiveRateExtra({ enabled: true, amount: -1 })).toThrow();
    expect(() => cleanLiveRateExtra({ enabled: true, amount: 51 })).toThrow();
  });
  it("the charge and the checkout display both add it, and the admin field uses the same cap", () => {
    const index = readFileSync(new URL("./index.js", import.meta.url), "utf8");
    expect(index).toMatch(/price: withLiveRateExtra\(Number\(rate\.amount\), liveRateExtra\(config\)\)/);
    // The checkout display is priced in shippoEndpoints.js (getShippoRates, moved out of index.js as is).
    const shippo = readFileSync(new URL("./shippoEndpoints.js", import.meta.url), "utf8");
    expect(shippo).toMatch(/rates\.map\(checkoutRate\)\.map\(\(rate\) => extra \?/);
    const admin = readFileSync(new URL("../src/app/admin/ShopSettings.tsx", import.meta.url), "utf8");
    expect(admin).toContain(`const MAX_LIVE_RATE_EXTRA = ${MAX_LIVE_RATE_EXTRA};`);
  });
});
