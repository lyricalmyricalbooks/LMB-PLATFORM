import { describe, expect, it } from "vitest";
import { shipFromLine, shipFromProblems, shippingStarterFor, shippingStepShows, starterProfile, starterSummary } from "./shippingStage";

const ids = (() => { let n = 0; return () => `id-${++n}`; })();
const complete = { street: "12 Queen Street", city: "Toronto", state: "ON", zip: "M5H 2N2", country: "Canada" };

describe("shipping and your address: the starter for the country (plan 17.11)", () => {
  it("Canada gets the Canada and rest-of-world set, the United States the two-country set, and other countries start empty", () => {
    expect(shippingStarterFor("Canada")).toBe("world");
    expect(shippingStarterFor("United States")).toBe("north-america");
    expect(shippingStarterFor("Japan")).toBe("blank");
    expect(shippingStarterFor("")).toBe("blank");
  });

  it("the starter profile has the zones Settings suggests, with the profile name", () => {
    const world = starterProfile("world", ids);
    expect(world?.name).toBe("Standard shipping");
    expect(world?.zones.map((z: any) => z.name)).toEqual(["Canada", "United States", "Rest of world"]);
    expect(starterProfile("north-america", ids)?.zones.length).toBe(2);
    expect(starterProfile("blank", ids)).toBeNull();
  });

  it("the prices shown before confirming are the prices that get saved", () => {
    const shown = starterSummary("world");
    const saved = starterProfile("world", ids)!;
    expect(shown[0]).toEqual({ zone: "Canada", first: "8.00", extra: "3.00" });
    expect(saved.zones[0].rates[0].base).toBe(8);
    expect(saved.zones[0].rates[0].additional).toBe(3);
  });
});

describe("the ship-from address is checked the way step 1 checks it", () => {
  it("names each gap in plain words, and gives one line when complete", () => {
    expect(shipFromProblems({ ...complete, street: "", zip: " " })).toEqual([
      "Add the street address your orders ship from.",
      "Add your postal code.",
    ]);
    expect(shipFromProblems(complete)).toEqual([]);
    expect(shipFromLine(complete)).toBe("12 Queen Street, Toronto, ON, M5H 2N2, Canada");
    expect(shipFromLine({ ...complete, city: "" })).toBe("");
  });
});

describe("the step shows only for a press that went through Get started", () => {
  const started = { details: { at: "a" }, plan: "both", welcome: { theme: "x", at: "a" }, google: { at: "a", coming: true } };
  it("shows after the look, until it is finished", () => {
    expect(shippingStepShows(started)).toBe(true);
    expect(shippingStepShows({ ...started, shipping: { at: "b" } })).toBe(false);
  });
  it("waits for Google (step 4) before it shows", () => {
    expect(shippingStepShows({ ...started, google: undefined })).toBe(false);
  });
  it("never shows for an older shop, a stockroom-only plan, or before the look", () => {
    expect(shippingStepShows({ plan: "both", welcome: { theme: "x", at: "a" } })).toBe(false);
    expect(shippingStepShows({ ...started, plan: "stockroom" })).toBe(false);
    expect(shippingStepShows({ details: { at: "a" }, plan: "both" })).toBe(false);
    expect(shippingStepShows(null)).toBe(false);
  });
});
