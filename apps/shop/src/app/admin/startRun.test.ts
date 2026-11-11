import { describe, expect, it } from "vitest";
import { nextRunStep, runSteps } from "./startRun";

const base = { details: { at: "a" }, bring: { at: "a" }, plan: "both" };
const look = { ...base, welcome: { theme: "zine", at: "a" } };
const paid = { ...look, payments: { at: "c", ready: true } };
const shipped = { ...paid, shipping: { at: "c", skipped: true } };
const closed = { design: { showUnderConstruction: true } };

describe("the run's order is decided in one place (plans 17.1 to 17.13)", () => {
  it("walks a platform press through every step in order, Get paid before shipping", () => {
    expect(nextRunStep({ plan: "both" }, closed, "stripe")).toBe("details");
    expect(nextRunStep({ ...base, bring: undefined }, closed, "stripe")).toBe("bring");
    expect(nextRunStep(base, closed, "stripe")).toBe("look");
    expect(nextRunStep(look, closed, "stripe")).toBe("payments");
    expect(nextRunStep(paid, closed, "stripe")).toBe("shipping");
    expect(nextRunStep(shipped, closed, "stripe")).toBe("final");
  });

  it("a shop on its own payment keys skips Get paid", () => {
    expect(nextRunStep(look, closed, null)).toBe("shipping");
    expect(nextRunStep({ ...shipped, payments: undefined }, closed, null)).toBe("final");
  });

  it("Square presses see Get paid too", () => {
    expect(nextRunStep(look, closed, "square")).toBe("payments");
  });

  it("ends when the shop is open, or the final check is done", () => {
    expect(nextRunStep(shipped, { design: { showUnderConstruction: false } }, null)).toBeNull();
    expect(nextRunStep({ ...shipped, finalCheck: { at: "d", opened: true } }, closed, "stripe")).toBeNull();
  });

  it("older shops and stockroom-only plans never see the run", () => {
    expect(nextRunStep({ plan: "both" }, closed, "stripe")).toBe("details");
    expect(nextRunStep({ plan: "both", welcome: { theme: "x", at: "a" } }, closed, "stripe")).toBeNull();
    expect(nextRunStep({ plan: "stockroom" }, closed, "stripe")).toBeNull();
    expect(nextRunStep(null, closed, "stripe")).toBeNull();
  });

  it("Google is not a step: an older document's Google marker changes nothing", () => {
    expect(nextRunStep({ ...look, google: { at: "b", coming: true } }, closed, null)).toBe("shipping");
  });

  it("the progress strip counts only the steps this press walks", () => {
    expect(runSteps("stripe")).toEqual(["details", "bring", "look", "payments", "shipping", "final"]);
    expect(runSteps(null)).toEqual(["details", "bring", "look", "shipping", "final"]);
  });
});
