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
    case "address": return "accountMemberAddressError";
    case "email": return "membershipErrorGiftEmail";
    case "months": return "membershipErrorGeneric";
    case "gift": return "accountMemberErrorState";
    default: return status === 429 ? "membershipErrorTooMany" : "membershipErrorGeneric";
  }
}

/** The account card's state word. */
export const memberStateKey = (state: MemberState) => `accountMemberState_${state}`;

/**
 * The account card's "what happens next" line and its date, or null when there is nothing to say. `day` writes a date.
 */
export function memberNext(m: { state: MemberState; periodEnd: string; trialEnd: string; endedAt: string; pausedAt?: string; gift?: unknown }): { key: string; at: string } | null {
  if (m.gift && m.state === "active" && m.periodEnd) return { key: "accountMemberGiftEnds", at: m.periodEnd };
  if (m.state === "paused") return { key: "accountMemberPausedSince", at: m.pausedAt || "" };
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
  // Skip and pause (M3c): only while paid up; skipping is offered on box memberships only.
  pause: state === "active",
  unpause: state === "paused",
  skip: state === "active",
  card: state !== "ended" && state !== "pending",
});

/** A box membership's address on one line ("12 Main St, Apt 3, Toronto, ON M6G 3H1, CA"). */
export function addressLine(a: { line1: string; line2?: string; city: string; state?: string; postalCode: string; country: string } | null | undefined): string {
  if (!a) return "";
  return [a.line1, a.line2, a.city, [a.state, a.postalCode].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
}
