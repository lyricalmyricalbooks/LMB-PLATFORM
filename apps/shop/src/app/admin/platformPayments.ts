// Settings › Payments › Card payments for a shop whose cards run through Colophon (plan 2.2b / 2.10): the press's own
// Square or Stripe account, connected through the platform. The words and the return notices live here so they are
// tested without the page.

export type PlatformFee = { percent: number; refundedWithRefunds: boolean };
export type AccountNeed = { words: string; pastDue: boolean };

/** What the platform says about the press's card account (functions/checkoutAdmin.js handlePlatformPayments). */
export type PlatformPaymentsAnswer = {
  provider?: "stripe" | "square";
  connected?: boolean;
  accountId?: string;
  locationName?: string | null;
  currency?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: number;
  /** What Stripe still needs, in plain words (services/payments/requirements.js), past due first (plan 7.9). */
  needs?: AccountNeed[];
  /** When the rest is due (ISO), or null. */
  deadline?: string | null;
  /** Something is past its deadline: Stripe has paused cards or payouts. */
  pastDue?: boolean;
  platformFee?: PlatformFee;
  url?: string;
};

// One rule for the provider's name everywhere (code plan 5.2): a provider id here, the shop profile elsewhere.
export { providerName } from "../../lib/shopProfile";

/** A Stripe account the platform made exists from the start; it is "connected" once its details are in. */
export function accountConnected(answer: PlatformPaymentsAnswer): boolean {
  if (answer.provider === "square") return answer.connected === true;
  return answer.detailsSubmitted === true;
}

/** Plain words for the platform's fee, shown next to payouts (owner's instruction, 28 October 2026). */
export function feeLine(fee: PlatformFee | undefined): string {
  if (!fee || !(fee.percent > 0)) return "Colophon takes no fee on your card sales. You keep everything except your card provider's own fee.";
  const percent = Number.isInteger(fee.percent) ? String(fee.percent) : fee.percent.toFixed(2).replace(/0+$/, "");
  const refunds = fee.refundedWithRefunds
    ? " When you refund a sale, the same share of the fee comes back to you."
    : " The fee stays with Colophon when you refund a sale.";
  return `Colophon keeps ${percent}% of each card sale before it reaches your payouts, on top of your card provider's own fee.${refunds}`;
}

export type ReturnNotice = { tone: "success" | "warning" | "danger"; text: string };

/**
 * What happened when Square or Stripe sent the owner back here (`?square=…` / `?stripe=…`); null when nothing did.
 * `current` is the shop's provider: coming back from the other one is a switch being set up (code plan 27.6c).
 */
export function returnNotice(search: string, current?: "stripe" | "square"): ReturnNotice | null {
  const params = new URLSearchParams(search);
  const square = params.get("square");
  if (current === "stripe" && square === "connected") return { tone: "success", text: "Square is connected. Switch whenever you're ready." };
  if (current === "stripe" && square === "denied") return { tone: "warning", text: "Square wasn't connected: the sign-in was cancelled." };
  if (square === "connected") return { tone: "success", text: "Square is connected. Your shop can take cards now." };
  if (square === "denied") return { tone: "warning", text: "Square wasn't connected: the sign-in was cancelled. Press Connect Square to try again." };
  if (square === "in_use") return { tone: "danger", text: "That Square account is already connected to another shop. Sign in with this shop's own Square account." };
  if (square === "other_account") return { tone: "danger", text: "That's a different Square account from the one this shop uses. Sign in with the same account as before." };
  if (square) return { tone: "danger", text: "Square couldn't be connected just now. Wait a minute and press Connect Square again." };
  const stripe = params.get("stripe");
  if (stripe === "return") return { tone: "success", text: "Back from Stripe. If anything is still missing, it's listed below." }; // Stripe shops only
  if (stripe === "refresh") return { tone: "warning", text: "That Stripe page expired. Press Continue with Stripe to get a new one." }; // Stripe shops only
  return null;
}

/** The address without `square` / `stripe`, so a reload doesn't show the notice again. */
export function withoutReturnFlags(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("square");
  url.searchParams.delete("stripe");
  return url.toString();
}

/** The Stripe button's words. Each press asks the platform for a fresh Stripe page: Stripe's links work once. */
export const CONTINUE_WITH_STRIPE = "Continue with Stripe"; // Stripe shops only

/** Cards and payouts both work (Stripe), or cards work (Square, which pays out by itself): the step is done. */
export function paymentsReady(answer: PlatformPaymentsAnswer): boolean {
  if (!accountConnected(answer) || answer.chargesEnabled !== true) return false;
  return answer.provider === "square" || answer.payoutsEnabled === true;
}

/** "your bank details", "your bank details and your date of birth", "a, b and c". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "12 November", in the owner's own time zone (a test passes one). */
export function dueDateText(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", ...(timeZone ? { timeZone } : {}) }).format(date);
}

/**
 * What Stripe still needs, in one or two plain sentences: "Stripe needs your bank details by 12 November." Past-due
 * details come first and say what has stopped. null when nothing is needed (or for Square, which asks for nothing here).
 */
export function needsLine(answer: PlatformPaymentsAnswer, timeZone?: string): string | null {
  if (answer.provider === "square") return null;
  const needs = Array.isArray(answer.needs) ? answer.needs : [];
  const late = needs.filter((n) => n.pastDue).map((n) => n.words);
  const due = needs.filter((n) => !n.pastDue).map((n) => n.words);
  const by = answer.deadline ? dueDateText(answer.deadline, timeZone) : "";
  const parts: string[] = [];
  if (late.length) parts.push(`Stripe needs ${joinWords(late)} now. The deadline has passed, so Stripe has paused card payments or payouts until it has ${late.length === 1 ? "it" : "them"}.`); // Stripe shops only
  if (due.length) parts.push(`${late.length ? "It also needs" : "Stripe needs"} ${joinWords(due)}${by ? ` by ${by}` : ""}.`); // Stripe shops only
  return parts.length ? parts.join(" ") : null;
}

/** The other provider's account, connected to switch to (functions/checkoutAdmin.js step "nextStatus"). */
export type SwitchAnswer = PlatformPaymentsAnswer & {
  /** No account connected to switch to yet. */
  next?: null;
  /** The press pressed Switch: both accounts take sales until Colophon has moved the shop over. */
  switching?: { to: "stripe" | "square"; accountId: string; at: string } | null;
};

/** Where a switch to the other provider stands, for Settings › Payments. */
export type SwitchStage = "start" | "connecting" | "ready" | "switching";

export function switchStage(answer: SwitchAnswer | null): SwitchStage {
  if (!answer || answer.next === null || !answer.provider) return "start";
  if (answer.switching) return "switching";
  return accountConnected(answer) && answer.chargesEnabled === true ? "ready" : "connecting";
}

/** A switch waiting longer than this is "taking longer than usual" (the control room lists it under Today). */
export const SWITCH_SLOW_MS = 24 * 60 * 60 * 1000;

/**
 * What the press reads while a switch is under way: when it started, and that sales keep going through the old
 * provider. After a day it also says Colophon is on it, so a slow switch never looks forgotten.
 */
export function switchingLine(answer: SwitchAnswer, from: string, nowMs = Date.now(), timeZone?: string): string {
  const at = answer.switching?.at ?? "";
  const started = at ? dueDateText(at, timeZone) : "";
  const slow = started && nowMs - new Date(at).getTime() > SWITCH_SLOW_MS;
  const parts = [started ? `Started ${started}.` : "", slow ? "It's taking longer than usual, and Colophon is on it." : "", `New sales keep going to ${from} until it's done.`];
  return parts.filter(Boolean).join(" ");
}

/** The provider a shop selling through `current` can switch to. */
export const otherProvider = (current: "stripe" | "square"): "stripe" | "square" => (current === "square" ? "stripe" : "square");
