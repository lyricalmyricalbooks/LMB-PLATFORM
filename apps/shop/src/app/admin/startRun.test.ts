import { describe, expect, it } from "vitest";
import { nextRunStep, runSteps } from "./startRun";

// The order since the sign-up to open shop plan (move 4): the look, the products, Get paid, contact, shipping, open.
const looked = { plan: "both", welcome: { theme: "zine", at: "a", firstRun: true } };
const brought = { ...looked, bring: { at: "a" } };
const paid = { ...brought, payments: { at: "c", ready: true } };
const reached = { ...paid, details: { at: "b" } };
const shipped = { ...reached, shipping: { at: "c", skipped: true } };
const closed = { design: { showUnderConstruction: true } };

describe("the run's order is decided in one place (plans 17.1 to 17.13, move 4)", () => {
  it("walks a platform press through every step in order: the look first, contact and shipping last", () => {
    expect(nextRunStep({ plan: "both" }, closed, "stripe")).toBe("offer");
    expect(nextRunStep({ plan: "both", offer: { at: "a" } }, closed, "stripe")).toBe("look");
    expect(nextRunStep(looked, closed, "stripe")).toBe("bring");
    expect(nextRunStep(brought, closed, "stripe")).toBe("payments");
    expect(nextRunStep(paid, closed, "stripe")).toBe("details");
    expect(nextRunStep(reached, closed, "stripe")).toBe("shipping");
    expect(nextRunStep(shipped, closed, "stripe")).toBe("final");
  });

  it("a shop on its own payment keys skips Get paid", () => {
    expect(nextRunStep(brought, closed, null)).toBe("details");
    expect(nextRunStep({ ...shipped, payments: undefined }, closed, null)).toBe("final");
  });

  it("Square presses see Get paid too", () => {
    expect(nextRunStep(brought, closed, "square")).toBe("payments");
  });

  it("a shop part-way through the older order carries on: the look, then what is left", () => {
    const older = { plan: "both", details: { at: "a" }, bring: { at: "a" } };
    expect(nextRunStep({ ...older, offer: { at: "a" } }, closed, "stripe")).toBe("look");
    expect(nextRunStep({ ...older, welcome: { theme: "zine", at: "b" } }, closed, "stripe")).toBe("payments");
    expect(nextRunStep({ plan: "both", details: { at: "a" }, offer: { at: "a" } }, closed, null)).toBe("look");
  });

  it("ends when the shop is open, or the final check is done", () => {
    expect(nextRunStep(shipped, { design: { showUnderConstruction: false } }, null)).toBeNull();
    expect(nextRunStep({ ...shipped, finalCheck: { at: "d", opened: true } }, closed, "stripe")).toBeNull();
  });

  it("older shops and stockroom-only plans never see the run", () => {
    expect(nextRunStep({ plan: "both", welcome: { theme: "x", at: "a" } }, closed, "stripe")).toBeNull();
    expect(nextRunStep({ plan: "stockroom" }, closed, "stripe")).toBeNull();
    expect(nextRunStep(null, closed, "stripe")).toBeNull();
  });

  it("asks What you offer first, and never asks it of a shop already past its look (shop types plan)", () => {
    expect(nextRunStep({ plan: "both", publishes: "hair" }, closed, null)).toBe("offer");
    expect(nextRunStep(looked, closed, "stripe")).toBe("bring");
    expect(nextRunStep({ plan: "both", offer: { at: "a" }, welcome: { theme: "zine", at: "a", firstRun: true } }, closed, "stripe")).toBe("bring");
  });

  it("Google is not a step: an older document's Google marker changes nothing", () => {
    expect(nextRunStep({ ...reached, google: { at: "b", coming: true } }, closed, null)).toBe("shipping");
  });

  it("the list counts only the steps this press walks", () => {
    expect(runSteps("stripe")).toEqual(["offer", "look", "bring", "payments", "details", "shipping", "final"]);
    expect(runSteps(null)).toEqual(["offer", "look", "bring", "details", "shipping", "final"]);
  });
});
