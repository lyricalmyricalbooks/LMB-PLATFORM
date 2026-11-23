import { describe, expect, test } from "vitest";
import { bookingStateKey, wantsBookingsCard } from "./AccountBookings";
import { previewAnswer } from "./bookTimePreview";
import { getCopy } from "./storeCopy";

describe("Your bookings in the account (plan 4, 2.10)", () => {
  test("asks the server only while bookings are on or the link was followed", () => {
    expect(wantsBookingsCard("/account", false)).toBe(false);
    expect(wantsBookingsCard("/account", true)).toBe(true);
    expect(wantsBookingsCard("/account/bookings", false)).toBe(true);
  });
  test("names each state in plain words", () => {
    expect(bookingStateKey({ status: "confirmed" }, false)).toBe("");
    expect(bookingStateKey({ status: "requested" }, false)).toBe("accountBookingsRequested");
    expect(bookingStateKey({ status: "cancelled" }, true)).toBe("accountBookingsCancelled");
    expect(bookingStateKey({ status: "cancelled", declined: true }, true)).toBe("accountBookingsDeclined");
    expect(bookingStateKey({ status: "confirmed", noShow: true }, true)).toBe("accountBookingsMissed");
    for (const key of ["accountBookingsRequested", "accountBookingsCancelled", "accountBookingsDeclined", "accountBookingsMissed"]) expect(getCopy({}, key)).not.toBe(key);
  });
  test("the preview shows coming and past visits", () => {
    const a = previewAnswer("bookingMine", {}, "CAD", Date.parse("2026-11-18T15:00:00Z"), "America/Toronto");
    expect(a.coming).toHaveLength(2);
    expect(a.past).toHaveLength(2);
    expect(Date.parse(a.coming[0].start)).toBeGreaterThan(Date.parse("2026-11-18T15:00:00Z"));
    expect(Date.parse(a.past[0].start)).toBeLessThan(Date.parse("2026-11-18T15:00:00Z"));
  });
});
