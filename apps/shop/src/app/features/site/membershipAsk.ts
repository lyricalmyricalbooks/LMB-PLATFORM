// Requests to the memberships server (functions/memberships.js `handlePublic`). Everything but the plan list needs the
// customer's own sign-in, sent as a Firebase ID token. Studio's preview gets sample answers (membershipPreview.ts) and
// never opens a card page.
import type { User } from "firebase/auth";
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview } from "./bookTimePreview";
import { previewMembershipAnswer } from "./membershipPreview";
import type { MemberState, PlanInterval } from "../../../shared/membershipRules";

export type PublicPlan = { id: string; name: string; description: string; perks: string[]; interval: PlanInterval; priceMinor: number; trialDays: number; currency: string; memberPercent?: number };
export type MembershipInfo = { on: boolean; currency?: string; ready?: boolean; plans?: PublicPlan[] };
export type MyMembership = {
  id: string; state: MemberState; plan: { name: string; interval: PlanInterval; priceMinor: number; trialDays: number; currency: string } | null;
  periodEnd: string; trialEnd: string; card: { brand: string; last4: string } | null; startedAt: string; endedAt: string; test: boolean; cardPending: boolean;
};

export type MembershipAction = "membershipInfo" | "membershipJoin" | "membershipMine" | "membershipCancel" | "membershipResume" | "membershipCard" | "membershipPage";

export async function askMembership(action: MembershipAction, body: Record<string, unknown> = {}, user?: User | null): Promise<Record<string, any>> {
  if (isBookingPreview()) return previewMembershipAnswer(action, body, shopCurrency());
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const locale = typeof document !== "undefined" ? document.documentElement.lang || "" : "";
  const response = await functionFetch("validateDiscountCode", { method: "POST", headers, body: JSON.stringify({ action, locale, ...body }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}
