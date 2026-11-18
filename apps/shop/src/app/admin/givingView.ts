// Donations & tips (beta): the admin page's own small rules (Giving.tsx), kept apart so they can be tested.
import { MAX_AMOUNTS, MAX_GIFT_MINOR, MIN_GIFT_MINOR } from "../../shared/givingRules";
import { MAX_GOAL_MINOR, MAX_REWARDS, MIN_GOAL_MINOR, MIN_REWARD_MINOR, daysLeft, goalProgress, type PublicFundraiser, type Reward, type ShipTo } from "../../shared/fundraiserRules";
import type { AdminGift, BlockedTries, FundraiserUpdate } from "./givingApi";

/** An amount the owner typed in dollars ("25", "12.50", "$40") as cents, or the problem in plain words. */
export function amountFromText(raw: string, money: (minor: number) => string): { minor: number } | { problem: string } {
  const cleaned = raw.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { problem: "Type an amount, like 25 or 12.50." };
  const minor = Math.round(Number(cleaned) * 100);
  if (minor < MIN_GIFT_MINOR) return { problem: `The lowest gift is ${money(MIN_GIFT_MINOR)}.` };
  if (minor > MAX_GIFT_MINOR) return { problem: `The highest gift is ${money(MAX_GIFT_MINOR)}.` };
  return { minor };
}

/** The suggested amounts with one more added: unique, smallest first, at most MAX_AMOUNTS. */
export function withAmount(amounts: number[], minor: number): number[] | { problem: string } {
  if (amounts.includes(minor)) return { problem: "That amount is already on the list." };
  if (amounts.length >= MAX_AMOUNTS) return { problem: `Up to ${MAX_AMOUNTS} amounts. Remove one first.` };
  return [...amounts, minor].sort((a, b) => a - b);
}

/** Who gave, as the owner reads it in the list. */
export function giverLine(gift: AdminGift): string {
  return gift.name || gift.email || "Someone";
}

/** The honour line: "In memory of Grace". */
export function honourText(gift: Pick<AdminGift, "honour">): string {
  if (!gift.honour) return "";
  return `${gift.honour.kind === "memory" ? "In memory of" : "In honour of"} ${gift.honour.name}`;
}

/** What the blocked-tries tile says under its number. */
export function blockedLine(b: BlockedTries): string {
  if (!b.total) return "Nothing suspicious in the last 30 days.";
  const parts = [
    b.tooSmall ? `${b.tooSmall} under the lowest gift` : "",
    b.tooMany ? `${b.tooMany} over the hourly limit` : "",
    b.bot ? `${b.bot} from bots` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}, in the last 30 days.`;
}

/** A day the owner reads: "18 Nov 2026". */
export function dayText(iso: string): string {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
}

/** A fundraiser goal typed by the owner ("3000", "$2,500.50"), in cents, or why it can't be one. */
export function goalFromText(raw: string): { minor: number } | { problem: string } {
  const cleaned = raw.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { problem: "Type the goal, like 3000." };
  const minor = Math.round(Number(cleaned) * 100);
  if (minor < MIN_GOAL_MINOR) return { problem: "Set a goal of at least 100." };
  if (minor > MAX_GOAL_MINOR) return { problem: "Set a goal of at most 1,000,000." };
  return { minor };
}

/** The words under a fundraiser's bar: what it raised, how far along, and when it ends. */
export function fundraiserLines(f: Pick<PublicFundraiser, "raisedMinor" | "goalMinor" | "endsOn" | "state">, money: (minor: number) => string, today = new Date().toISOString().slice(0, 10)) {
  const { percent } = goalProgress(f.raisedMinor, f.goalMinor);
  const left = daysLeft(f.endsOn, today);
  const when = f.state === "ended" ? "Ended"
    : f.state === "draft" ? `Would run to ${dayText(`${f.endsOn}T12:00:00Z`)}`
    : left <= 1 ? "Last day today" : `${left} days left`;
  return { raised: `${money(f.raisedMinor)} of ${money(f.goalMinor)}`, percent: `${percent}% of the goal`, when };
}

/** One reward as the drawer edits it: amounts and limits as typed. */
export type RewardRow = { id: string; title: string; description: string; from: string; limit: string; ships: boolean; when: string; taken: number };

export const rewardRowsOf = (rewards: readonly Reward[] = []): RewardRow[] => rewards.map((r) => ({
  id: r.id, title: r.title, description: r.description, from: String(r.minMinor / 100), limit: r.limit > 0 ? String(r.limit) : "", ships: r.ships, when: r.when, taken: r.taken || 0,
}));

export const blankReward = (): RewardRow => ({ id: "", title: "", description: "", from: "", limit: "", ships: false, when: "", taken: 0 });

/** The drawer's rows as the server takes them, or the first problem (with the row it is on). Blank rows are dropped. */
export function rewardsFromRows(rows: readonly RewardRow[]): { rewards: Partial<Reward>[] } | { problem: string; row: number } {
  const out: Partial<Reward>[] = [];
  const kept = rows.filter((r) => r.title.trim() || r.from.trim() || r.taken > 0);
  if (kept.length > MAX_REWARDS) return { problem: `${MAX_REWARDS} rewards at most.`, row: MAX_REWARDS };
  for (const [i, r] of kept.entries()) {
    const row = rows.indexOf(r);
    if (r.title.trim().length < 2) return { problem: "Give this reward a name.", row };
    const from = r.from.replace(/[$\s,]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(from)) return { problem: "Type the smallest gift for it, like 50.", row };
    const minMinor = Math.round(Number(from) * 100);
    if (minMinor < MIN_REWARD_MINOR) return { problem: "A reward needs a gift of at least 5.", row };
    const limitText = r.limit.trim();
    if (limitText && !/^\d+$/.test(limitText)) return { problem: "How many there are, as a whole number, or leave it blank.", row };
    const limit = limitText ? Number(limitText) : 0;
    if (limitText && limit < 1) return { problem: "Leave it blank for no limit.", row };
    if (limit > 0 && limit < r.taken) return { problem: `${r.taken} people already chose it, so there must be at least ${r.taken}.`, row };
    out[i] = { ...(r.id ? { id: r.id } : {}), title: r.title.trim(), description: r.description.trim(), minMinor, limit, ships: r.ships, when: r.when.trim() };
  }
  return { rewards: out };
}

/** "From $50 · 3 of 25 chosen" for the owner. */
export function rewardLine(r: Pick<Reward, "minMinor" | "limit" | "taken">, money: (minor: number) => string): string {
  const chosen = r.limit > 0 ? `${r.taken} of ${r.limit} chosen` : r.taken === 1 ? "1 chosen" : `${r.taken} chosen`;
  return `From ${money(r.minMinor)} · ${chosen}`;
}

/** An address on one line. */
export const shipToText = (a: ShipTo | null | undefined): string => (a ? [a.name, a.street, a.street2, a.city, [a.state, a.zip].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : "");

/** Rewards still to post or hand over: paid gifts with a reward not marked sent. */
export const rewardsToSend = (gifts: readonly AdminGift[]): number => gifts.filter((g) => g.status === "paid" && g.reward && !g.reward.sentAt).length;

/** How an update to supporters stands, in a few words and a badge tone (G2c). */
export function updateState(u: Pick<FundraiserUpdate, "status" | "audience" | "sent" | "failed" | "createdAt" | "finishedAt">): { tone: "success" | "info" | "warning" | "neutral"; badge: string; line: string } {
  const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);
  const bounced = u.failed > 0 ? ` ${u.failed === 1 ? "1 address" : `${u.failed} addresses`} didn't take it.` : "";
  if (u.status === "sent") return { tone: "success", badge: "Sent", line: `Sent to ${people(u.sent)} on ${dayText(u.finishedAt || u.createdAt)}.${bounced}` };
  if (u.status === "paused") return { tone: "warning", badge: "Paused", line: `Reached ${u.sent} of ${u.audience} so far.` };
  if (u.status === "cancelled") return { tone: "neutral", badge: "Stopped", line: `Stopped after ${people(u.sent)}.` };
  return { tone: "info", badge: "Sending", line: u.sent > 0 ? `Sent to ${u.sent} of ${u.audience} so far.` : `Going to ${people(u.audience)} in the next 15 minutes or so.` };
}

/** True while an update is still going out or can carry on, so a new one has to wait. */
export const updateBusy = (u: Pick<FundraiserUpdate, "status"> | undefined): boolean => !!u && (u.status === "queued" || u.status === "sending" || u.status === "paused");
