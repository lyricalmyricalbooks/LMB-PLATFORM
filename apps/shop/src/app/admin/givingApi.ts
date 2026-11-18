// Donations & tips (beta): what the admin asks the server for (functions/giving.js). Gifts, the giving settings and the
// blocked tries are server-only records, so every read and change goes through the `givingAdmin` action.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { GivingSettings, Honour } from "../../shared/givingRules";
import type { FundraiserStatus, PublicFundraiser, Reward, ShipTo } from "../../shared/fundraiserRules";

/** One gift as the owner sees it: the giver's details are the owner's to see, even when the giver stays anonymous to others. */
export type AdminGift = {
  id: string; status: "paid" | "refunded"; name: string; email: string; anonymous: boolean; honour: Honour | null; note: string;
  amountMinor: number; feeMinor: number; chargedMinor: number; currency: string; createdAt: string; paidAt: string; refundedAt: string; test: boolean; fundraiserId?: string;
  /** The thank-you reward the giver chose (G2b), and where to post it when it ships. */
  reward?: { id: string; title: string; ships: boolean; when: string; sentAt: string } | null; shipTo?: ShipTo | null;
};
/** A fundraiser as the owner sees it: the Support page's view plus when it was made, started and ended. */
export type AdminFundraiser = Omit<PublicFundraiser, "rewards"> & { status: FundraiserStatus; createdAt: string; startedAt: string; endedAt: string; rewards: Reward[] };
/** An update emailed to a fundraiser's givers (G2c, functions/fundraiserUpdates.js). */
export type FundraiserUpdate = {
  id: string; fundraiserId: string; subject: string; status: "queued" | "sending" | "sent" | "paused" | "cancelled";
  audience: number; sent: number; failed: number; createdAt: string; finishedAt: string; lastError: string;
};
/** Tries the card-testing guard refused in the last 30 days, per reason. */
export type BlockedTries = { tooSmall: number; tooMany: number; bot: number; total: number };
export type GivingTotals = { givenMinor: number; monthMinor: number; gifts: number; givers: number };
export type GivingList = { currency: string; settings: GivingSettings; gifts: AdminGift[]; totals: GivingTotals; blocked: BlockedTries; minMinor: number; maxMinor: number; fundraisers?: AdminFundraiser[]; today?: string;
  /** The last updates of each fundraiser, newest first, by fundraiser id. */
  updates?: Record<string, FundraiserUpdate[]> };
export type GivingAdminOp = "list" | "saveSettings" | "resendThanks" | "refund" | "hint" | "saveFundraiser" | "endFundraiser" | "rewardSent"
  | "updateCount" | "updateTest" | "updateSend" | "updateCancel" | "updateResume";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample gifts. */
export const givingData = {
  admin: adminFromServer as (op: GivingAdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

export const givingAdmin = <T = { ok?: boolean }>(op: GivingAdminOp, body: Record<string, unknown> = {}) => givingData.admin(op, body) as Promise<T>;

async function adminFromServer(op: GivingAdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "givingAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "That didn't save just now. Please try again."), { code: result.code });
  return result;
}
