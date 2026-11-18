// Memberships & subscriptions (beta): what the admin asks the server for (functions/memberships.js). Plans and
// memberships are server-only records, so every read and change goes through the `membershipsAdmin` action.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { MemberState, PlanInterval } from "../../shared/membershipRules";

/** A plan as the owner sees it, with how many live, paid members it has. */
export type AdminPlan = {
  id: string; name: string; description: string; perks: string[]; interval: PlanInterval; priceMinor: number; trialDays: number;
  currency: string; hidden: boolean; members: number;
};
/** The plan as it was when the member joined. */
export type JoinedPlan = { name: string; interval: PlanInterval; priceMinor: number; trialDays: number; currency: string };
/** One membership as the owner sees it. */
export type AdminMember = {
  id: string; state: MemberState; plan: JoinedPlan | null; planId: string; name: string; email: string;
  periodEnd: string; trialEnd: string; card: { brand: string; last4: string } | null;
  startedAt: string; endedAt: string; createdAt: string; checkedAt: string; test: boolean; cardPending: boolean;
};
export type MembersTotals = { members: number; monthlyMinor: number; pastDue: number };
export type MembersList = { currency: string; ready: boolean; plans: AdminPlan[]; members: AdminMember[]; totals: MembersTotals };
/** What the plan form sends (shared/membershipRules `cleanPlan` checks it on the server). */
export type PlanInput = { name: string; description: string; perks: string[]; interval: PlanInterval; priceMinor: number; trialDays: number; hidden: boolean };
export type MembersAdminOp = "list" | "savePlan" | "endNow" | "refresh" | "hint";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample members. */
export const membersData = {
  admin: adminFromServer as (op: MembersAdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

export const membersAdmin = <T = { ok?: boolean }>(op: MembersAdminOp, body: Record<string, unknown> = {}) => membersData.admin(op, body) as Promise<T>;

async function adminFromServer(op: MembersAdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "membershipsAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "That didn't save just now. Please try again."), { code: result.code });
  return result;
}
