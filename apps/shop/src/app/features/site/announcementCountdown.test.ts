import { describe, expect, it } from "vitest";
import { announcementCountdownText } from "./announcementCountdown";

const noon = Date.parse("2026-10-09T16:00:00Z"); // 12:00 in Toronto

describe("announcementCountdownText", () => {
  it("is empty while the switch is off or the message has no end day", () => {
    expect(announcementCountdownText({}, {}, "2026-10-09", noon)).toBe("");
    expect(announcementCountdownText({ announcementCountdown: true }, {}, undefined, noon)).toBe("");
  });
  it("picks days, hours or minutes words inside the window", () => {
    const on = { announcementCountdown: true };
    expect(announcementCountdownText(on, {}, "2026-10-10", noon)).toBe("Ends in 1d 12h");
    expect(announcementCountdownText(on, {}, "2026-10-09", noon)).toBe("Ends in 12h 0m");
    expect(announcementCountdownText(on, {}, "2026-10-09", Date.parse("2026-10-10T03:50:00Z"))).toBe("Ends in 10 min");
  });
  it("respects the window and an ended message", () => {
    expect(announcementCountdownText({ announcementCountdown: true, announcementCountdownWithin: 6 }, {}, "2026-10-09", noon)).toBe("");
    expect(announcementCountdownText({ announcementCountdown: true }, {}, "2026-10-08", noon)).toBe("");
  });
  it("uses the shop's own words", () => {
    expect(announcementCountdownText({ announcementCountdown: true }, { copy: { announceEndsHours: "{hours} hours to go" } }, "2026-10-09", noon)).toBe("12 hours to go");
  });
});
