import { describe, expect, it } from "vitest";
import { paymentsMarker, paymentsStepShows } from "./paymentsStage";

const google = { details: { at: "a" }, welcome: { theme: "zine", at: "a" }, plan: "both" };

describe("Get started, step 5: Get paid (plan 17.10)", () => {
  it("shows once the press has its details and look, and its cards go through the platform", () => {
    expect(paymentsStepShows(google, "stripe")).toBe(true);
    expect(paymentsStepShows(google, "square")).toBe(true);
  });

  it("never shows for a shop on its own keys, a stockroom-only plan, or a step not yet reached", () => {
    expect(paymentsStepShows(google, null)).toBe(false);
    expect(paymentsStepShows({ ...google, plan: "stockroom" }, "stripe")).toBe(false);
    expect(paymentsStepShows({ ...google, welcome: undefined }, "stripe")).toBe(false);
    expect(paymentsStepShows({ ...google, details: undefined }, "stripe")).toBe(false);
    expect(paymentsStepShows(null, "stripe")).toBe(false);
  });

  it("stops showing once it is finished or skipped", () => {
    expect(paymentsStepShows({ ...google, payments: { at: "c", ready: true } }, "stripe")).toBe(false);
    expect(paymentsStepShows({ ...google, payments: { at: "c", skipped: true } }, "stripe")).toBe(false);
  });

  it("records ready or skipped, and nothing else", () => {
    expect(paymentsMarker("t", "ready")).toEqual({ at: "t", ready: true });
    expect(paymentsMarker("t", "skipped")).toEqual({ at: "t", skipped: true });
  });
});
