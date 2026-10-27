import { describe, expect, it } from "vitest";
import { autoGrain } from "./overviewRange";

describe("autoGrain", () => {
  it("keeps the old choice by range length", () => {
    expect(autoGrain(7)).toBe("day"); expect(autoGrain(30)).toBe("day");
    expect(autoGrain(90)).toBe("week"); expect(autoGrain(365)).toBe("month");
  });
  it("groups a quiet 14–45 day range by week when fewer than half the days sold", () => {
    expect(autoGrain(30, 6)).toBe("week");
    expect(autoGrain(30, 15)).toBe("day");
    expect(autoGrain(7, 1)).toBe("day"); // a week is never grouped into one point
    expect(autoGrain(90, 2)).toBe("week");
  });
});
