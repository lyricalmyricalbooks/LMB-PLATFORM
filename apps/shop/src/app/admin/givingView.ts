// Donations & tips (beta): the admin page's own small rules (Giving.tsx), kept apart so they can be tested.
import { MAX_AMOUNTS, MAX_GIFT_MINOR, MIN_GIFT_MINOR } from "../../shared/givingRules";
import type { AdminGift, BlockedTries } from "./givingApi";

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
