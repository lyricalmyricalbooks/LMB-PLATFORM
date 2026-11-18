import { describe, expect, test } from "vitest";
import { memberCan, memberNext, membershipErrorKey, memberStateKey, planEveryKey } from "./membershipWords";
import { COPY_SCHEMA } from "./storeCopy";

const keys = new Set(COPY_SCHEMA.flatMap((g) => g.fields.map((f) => f.key)));

describe("membership words", () => {
  test("every word the page and the card may pick is in Text & labels", () => {
    const picked = [
      planEveryKey("month"), planEveryKey("year"),
      ...["member", "off", "plan", "not_available", "too_many", "state", "x"].map((c) => membershipErrorKey(c)),
      ...(["pending", "trial", "active", "pastDue", "ending", "ended"] as const).map(memberStateKey),
      "accountMemberTrialEnds", "accountMemberNextPayment", "accountMemberEnds", "accountMemberEnded", "accountMemberPastDue",
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
  test("what a member may do", () => {
    expect(memberCan("ending")).toEqual({ cancel: false, resume: true, card: true });
    expect(memberCan("ended")).toEqual({ cancel: false, resume: false, card: false });
    expect(memberCan("pastDue").cancel).toBe(true);
  });
});
