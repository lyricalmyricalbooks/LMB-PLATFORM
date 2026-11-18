import { describe, expect, it } from "vitest";
import { firstStepNow, getSetupShowing, setSetupShowing } from "./firstStep";

describe("Home shows one first step at a time", () => {
  it("puts setup first, then the tour offer, then Connect Google", () => {
    expect(firstStepNow(null, true)).toBe("wait");
    expect(firstStepNow(true, true)).toBe("setup");
    expect(firstStepNow(true, false)).toBe("setup");
    expect(firstStepNow(false, true)).toBe("tour");
    expect(firstStepNow(false, false)).toBe("google");
  });
  it("remembers what SetupStart said", () => {
    setSetupShowing(true);
    expect(getSetupShowing()).toBe(true);
    setSetupShowing(false);
    expect(getSetupShowing()).toBe(false);
  });
});
