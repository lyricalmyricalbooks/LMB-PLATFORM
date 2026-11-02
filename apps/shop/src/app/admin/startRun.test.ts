import { describe, expect, it } from "vitest";
import { nextRunStep } from "./startRun";

const base = { details: { at: "a" }, bring: { at: "a" }, plan: "both" };
const look = { ...base, welcome: { theme: "zine", at: "a" } };
const google = { ...look, google: { at: "b", coming: true } };
const shipped = { ...google, shipping: { at: "c", skipped: true } };
const closed = { design: { showUnderConstruction: true } };

describe("the run's order is decided in one place (plans 17.1 to 17.13)", () => {
  it("walks a new press through every step in order", () => {
    expect(nextRunStep({ plan: "both" }, closed)).toBe("details");
    expect(nextRunStep({ ...base, bring: undefined }, closed)).toBe("bring");
    expect(nextRunStep(base, closed)).toBe("look");
    expect(nextRunStep(look, closed)).toBe("google");
    expect(nextRunStep(google, closed)).toBe("shipping");
    expect(nextRunStep(shipped, closed)).toBe("final");
  });

  it("ends when the shop is open, or the final check is done", () => {
    expect(nextRunStep(shipped, { design: { showUnderConstruction: false } })).toBeNull();
    expect(nextRunStep({ ...shipped, finalCheck: { at: "d", opened: true } }, closed)).toBeNull();
  });

  it("older shops and stockroom-only plans never see the run", () => {
    expect(nextRunStep({ plan: "both" }, closed)).toBe("details");
    expect(nextRunStep({ plan: "both", welcome: { theme: "x", at: "a" } }, closed)).toBeNull();
    expect(nextRunStep({ plan: "stockroom" }, closed)).toBeNull();
    expect(nextRunStep(null, closed)).toBeNull();
  });
});
