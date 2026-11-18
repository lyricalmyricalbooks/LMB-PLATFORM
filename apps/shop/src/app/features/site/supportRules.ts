// Support page (/support, Donations & tips beta): what the server answers and the page's own small rules, kept apart from
// SupportPage.tsx so they can be tested. The server (functions/giving.js) checks every amount again.
import { coverFeeMinor, MAX_GIFT_MINOR, MIN_GIFT_MINOR } from "../../../shared/givingRules";
import { daysLeft, goalProgress, type PublicFundraiser, type PublicReward } from "../../../shared/fundraiserRules";

export type GivingInfo = {
  on: boolean; currency?: string; minMinor?: number; maxMinor?: number; cardsReady?: boolean;
  amounts?: number[]; otherAmount?: boolean; coverFee?: boolean; honour?: boolean;
  /** The page's form token: sent back with the gift so the server knows a person filled the form in. */
  form?: string;
  /** The fundraiser running now (G2), or null. */
  fundraiser?: PublicFundraiser | null;
  /** The shop's own day, for the days left. */
  today?: string;
};
export type GiftView = {
  id: string; status: "held" | "paid" | "cancelled" | "refunded"; amountMinor: number; feeMinor: number; chargedMinor: number; currency: string;
  name: string; anonymous: boolean; honour: { kind: "honour" | "memory"; name: string } | null; paidAt: string; refunded: boolean;
  reward?: { title: string; ships: boolean; when: string; sent: boolean } | null;
};

/** What the giver typed in the other-amount box as cents, or null when it isn't a whole amount of money. */
export function typedMinor(raw: string): number | null {
  const cleaned = String(raw || "").replace(/[$€£\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Why the chosen amount can't be given yet, as a copy key, or "" when it can. */
export function amountProblem(minor: number | null, min = MIN_GIFT_MINOR, max = MAX_GIFT_MINOR): "" | "supportPickAmount" | "supportTooSmall" | "supportTooBig" {
  if (minor === null || !(minor > 0)) return "supportPickAmount";
  if (minor < min) return "supportTooSmall";
  if (minor > max) return "supportTooBig";
  return "";
}

/** What the card page will charge: the gift, plus the card fee when the giver covers it. */
export function chargeFor(minor: number, cover: boolean): { feeMinor: number; totalMinor: number } {
  const feeMinor = cover && minor > 0 ? coverFeeMinor(minor) : 0;
  return { feeMinor, totalMinor: minor + feeMinor };
}

/** The giver's own page after the card page: `?gift=…&key=…`, or null. */
export function giftFromSearch(search: string): { id: string; key: string } | null {
  const q = new URLSearchParams(search);
  const id = q.get("gift") || "";
  const key = q.get("key") || "";
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) && /^[a-f0-9]{48}$/.test(key) ? { id, key } : null;
}

/** The fundraiser's lines on the Support page as copy keys and their values: the raised line, supporters and time left. */
export function fundraiserFacts(f: PublicFundraiser, today: string): { bar: number; reached: boolean; supporters: [string, Record<string, number>]; when: [string, Record<string, number>] } {
  const { bar, percent } = goalProgress(f.raisedMinor, f.goalMinor);
  const days = daysLeft(f.endsOn, today);
  return {
    bar, reached: percent >= 100,
    supporters: f.supporters === 1 ? ["supportFundOneSupporter", {}] : ["supportFundSupporters", { count: f.supporters }],
    when: days <= 1 ? ["supportFundLastDay", {}] : ["supportFundDaysLeft", { days }],
  };
}

/** The fundraiser's story as paragraphs: a blank line starts a new one. */
export const storyParagraphs = (story: string): string[] => String(story || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** The words under a reward's name for how many are left: none for no limit, "Last one", "3 left" or "All gone". */
export function rewardStock(r: Pick<PublicReward, "left" | "gone">): [string, Record<string, number>] | null {
  if (r.gone) return ["supportRewardGone", {}];
  if (r.left == null) return null;
  return r.left === 1 ? ["supportRewardLastOne", {}] : ["supportRewardLeft", { count: r.left }];
}

/** Picking a reward with a gift below its smallest: the amount to raise the gift to (a suggested amount when one fits). */
export function amountForReward(minor: number | null, reward: Pick<PublicReward, "minMinor">, amounts: readonly number[]): { picked: number | "other"; typed?: string } | null {
  if (minor != null && minor >= reward.minMinor) return null;
  const fits = amounts.find((a) => a === reward.minMinor);
  if (fits != null) return { picked: fits };
  return { picked: "other", typed: (reward.minMinor / 100).toFixed(reward.minMinor % 100 ? 2 : 0) };
}
