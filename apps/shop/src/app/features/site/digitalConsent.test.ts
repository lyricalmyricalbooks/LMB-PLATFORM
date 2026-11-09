import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DIGITAL_CONSENT_NOTE, needsDigitalConsent } from "./digitalConsent";

describe("download consent for EU, EEA and UK shoppers", () => {
  it("asks only when the bag has a digital item and an address is in a 14-day-cancel country", () => {
    expect(needsDigitalConsent(true, ["France", ""])).toBe(true);
    expect(needsDigitalConsent(true, ["Canada", "United Kingdom"])).toBe(true);
    expect(needsDigitalConsent(true, ["NO"])).toBe(true);
    expect(needsDigitalConsent(true, ["Canada", "United States"])).toBe(false);
    expect(needsDigitalConsent(false, ["Germany"])).toBe(false);
    expect(needsDigitalConsent(true, [undefined, null])).toBe(false);
  });

  it("uses the same order-history words as the confirmation email", () => {
    const server = readFileSync(new URL("../../../../functions/sellerDetails.js", import.meta.url), "utf8");
    expect(server).toContain(JSON.stringify(DIGITAL_CONSENT_NOTE));
  });
});
