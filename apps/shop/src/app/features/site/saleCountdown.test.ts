import { describe, expect, it } from "vitest";
import { saleCountdown, saleCountdownCopy, saleStopsAt } from "./saleCountdown";

// 2026-10-31 is the last day: the sale stops at midnight Toronto (EDT, UTC−4) = 2026-11-01T04:00Z.
const STOP = Date.parse("2026-11-01T04:00:00Z");

describe("sale countdown", () => {
  it("ends at the Toronto midnight after the last day", () => {
    expect(saleStopsAt("2026-10-31")).toBe(STOP);
    expect(saleStopsAt("2026-12-31")).toBe(Date.parse("2027-01-01T05:00:00Z"));
    expect(saleStopsAt("")).toBeNaN();
    expect(saleStopsAt("31/10/2026")).toBeNaN();
  });

  it("counts only inside the window and before the end", () => {
    expect(saleCountdown("2026-10-31", STOP - 73 * 3_600_000, 72)).toBeNull();
    expect(saleCountdown("2026-10-31", STOP - 72 * 3_600_000, 72)).toEqual({ days: 3, hours: 0, minutes: 0 });
    expect(saleCountdown("2026-10-31", STOP, 72)).toBeNull();
    expect(saleCountdown("2026-10-31", STOP + 1, 72)).toBeNull();
    expect(saleCountdown("2026-10-31", STOP - 1000, 0)).toBeNull();
  });

  it("rounds up to the minute and picks the line", () => {
    const left = saleCountdown("2026-10-31", STOP - (5 * 3_600_000 + 11 * 60_000 + 5_000), 72)!;
    expect(left).toEqual({ days: 0, hours: 5, minutes: 12 });
    expect(saleCountdownCopy(left).key).toBe("pdpSaleCountdownHours");
    expect(saleCountdownCopy({ days: 1, hours: 2, minutes: 3 })).toEqual({ key: "pdpSaleCountdownDays", values: { days: "1", hours: "2", minutes: "3" } });
    expect(saleCountdownCopy(saleCountdown("2026-10-31", STOP - 1000, 72)!)).toEqual({ key: "pdpSaleCountdownMinutes", values: { days: "0", hours: "0", minutes: "1" } });
  });
});
