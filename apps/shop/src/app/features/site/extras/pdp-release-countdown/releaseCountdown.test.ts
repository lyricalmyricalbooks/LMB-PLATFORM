import { describe, expect, it } from "vitest";
import { releaseCountdown, releaseCountdownCopy } from "./releaseCountdown";

// 2026-11-03 opens at midnight Toronto (EST, UTC−5 after the clocks change on 1 November) = 2026-11-03T05:00Z.
const START = Date.parse("2026-11-03T05:00:00Z");

describe("release countdown", () => {
  it("counts only inside the window and before the release day", () => {
    expect(releaseCountdown("2026-11-03", START - 73 * 3_600_000, 72)).toBeNull();
    expect(releaseCountdown("2026-11-03", START - 72 * 3_600_000, 72)).toEqual({ days: 3, hours: 0, minutes: 0 });
    expect(releaseCountdown("2026-11-03", START - (5 * 3_600_000 + 12 * 60_000), 72)).toEqual({ days: 0, hours: 5, minutes: 12 });
    expect(releaseCountdown("2026-11-03", START, 72)).toBeNull();
    expect(releaseCountdown("2026-11-03", START + 1, 72)).toBeNull();
    expect(releaseCountdown("2026-11-03", START - 1000, 0)).toBeNull();
  });

  it("ignores missing or malformed dates", () => {
    expect(releaseCountdown("", START - 1000, 72)).toBeNull();
    expect(releaseCountdown("03/11/2026", START - 1000, 72)).toBeNull();
    expect(releaseCountdown("2026-11-03T10:00", START - 1000, 72)).toBeNull();
  });

  it("picks the line by what is left", () => {
    expect(releaseCountdownCopy({ days: 1, hours: 2, minutes: 3 })).toEqual({ key: "pdpReleaseCountdownDays", values: { days: "1", hours: "2", minutes: "3" } });
    expect(releaseCountdownCopy({ days: 0, hours: 2, minutes: 3 }).key).toBe("pdpReleaseCountdownHours");
    expect(releaseCountdownCopy(releaseCountdown("2026-11-03", START - 1000, 72)!)).toEqual({ key: "pdpReleaseCountdownMinutes", values: { days: "0", hours: "0", minutes: "1" } });
  });
});
