// Membership page and account card: which Text & labels word to show. Pure, so membershipWords.test.ts covers it.
import type { MemberState, PlanInterval } from "../../../shared/membershipRules";

/** "a month" / "a year" under a plan's price. */
export const planEveryKey = (interval: PlanInterval) => (interval === "year" ? "membershipEveryYear" : "membershipEveryMonth");

/** The server's refusal as a word key; never the server's own words. */
export function membershipErrorKey(code: unknown, status?: unknown): string {
  switch (code) {
    case "member": return "membershipErrorMember";
    case "off": return "membershipClosed";
    case "plan": return "membershipErrorPlan";
    case "not_available": return "membershipNotReady";
    case "too_many": return "membershipErrorTooMany";
    case "state": return "accountMemberErrorState";
    default: return status === 429 ? "membershipErrorTooMany" : "membershipErrorGeneric";
  }
}

/** The account card's state word. */
export const memberStateKey = (state: MemberState) => `accountMemberState_${state}`;

/**
 * The account card's "what happens next" line and its date, or null when there is nothing to say. `day` writes a date.
 */
export function memberNext(m: { state: MemberState; periodEnd: string; trialEnd: string; endedAt: string }): { key: string; at: string } | null {
  if (m.state === "trial" && m.trialEnd) return { key: "accountMemberTrialEnds", at: m.trialEnd };
  if (m.state === "active" && m.periodEnd) return { key: "accountMemberNextPayment", at: m.periodEnd };
  if (m.state === "ending" && m.periodEnd) return { key: "accountMemberEnds", at: m.periodEnd };
  if (m.state === "ended" && m.endedAt) return { key: "accountMemberEnded", at: m.endedAt };
  if (m.state === "pastDue") return { key: "accountMemberPastDue", at: "" };
  return null;
}

/** What the member may do now. */
export const memberCan = (state: MemberState) => ({
  cancel: state === "trial" || state === "active" || state === "pastDue",
  resume: state === "ending",
  card: state !== "ended" && state !== "pending",
});
