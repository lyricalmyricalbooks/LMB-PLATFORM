import { describe, expect, test } from "vitest";
import { addressLine, memberCan, memberNext, membershipErrorKey, memberStateKey, planEveryKey } from "./membershipWords";
import { COPY_SCHEMA } from "./storeCopy";

const keys = new Set(COPY_SCHEMA.flatMap((g) => g.fields.map((f) => f.key)));

describe("membership words", () => {
  test("every word the page and the card may pick is in Text & labels", () => {
    const picked = [
      planEveryKey("month"), planEveryKey("year"),
      ...["member", "off", "plan", "not_available", "too_many", "state", "address", "x"].map((c) => membershipErrorKey(c)),
      ...(["pending", "trial", "active", "pastDue", "ending", "ended"] as const).map(memberStateKey),
      "accountMemberTrialEnds", "accountMemberNextPayment", "accountMemberEnds", "accountMemberEnded", "accountMemberPastDue",
      "accountMemberAddAddress", "accountMemberChangeAddress", "accountMemberAddressSaved", "membershipBoxLine",
    ];
    for (const k of picked) expect(keys.has(k), k).toBe(true);
  });
  test("a busy answer reads as too many tries", () => {
    expect(membershipErrorKey(undefined, 429)).toBe("membershipErrorTooMany");
    expect(membershipErrorKey(undefined, 500)).toBe("membershipErrorGeneric");
  });
  test("what happens next", () => {
    expect(memberNext({ state: "active", periodEnd: "2026-12-01", trialEnd: "", endedAt: "" })).toEqual({ key: "accountMemberNextPayment", at: "2026-12-01" });
    expect(memberNext({ state: "trial", periodEnd: "", trialEnd: "2026-12-02", endedAt: "" })?.key).toBe("accountMemberTrialEnds");
    expect(memberNext({ state: "pending", periodEnd: "", trialEnd: "", endedAt: "" })).toBeNull();
  });
  test("an address on one line", () => {
    expect(addressLine({ line1: "12 Main St", line2: "", city: "Toronto", state: "ON", postalCode: "M6G 3H1", country: "CA" })).toBe("12 Main St, Toronto, ON M6G 3H1, CA");
    expect(addressLine({ line1: "1 Elm", line2: "Apt 3", city: "Austin", state: "", postalCode: "78701", country: "US" })).toBe("1 Elm, Apt 3, Austin, 78701, US");
    expect(addressLine(null)).toBe("");
  });
  test("what a member may do", () => {
    expect(memberCan("ending")).toEqual({ cancel: false, resume: true, card: true, pause: false, unpause: false, skip: false });
    expect(memberCan("ended")).toEqual({ cancel: false, resume: false, card: false, pause: false, unpause: false, skip: false });
    expect(memberCan("active")).toMatchObject({ pause: true, skip: true, unpause: false });
    expect(memberCan("paused")).toMatchObject({ pause: false, skip: false, unpause: true, cancel: false, card: true });
    expect(memberNext({ state: "paused", periodEnd: "", trialEnd: "", endedAt: "", pausedAt: "2026-11-20T12:00:00Z" })).toEqual({ key: "accountMemberPausedSince", at: "2026-11-20T12:00:00Z" });
    expect(memberCan("pastDue").cancel).toBe(true);
  });
});
