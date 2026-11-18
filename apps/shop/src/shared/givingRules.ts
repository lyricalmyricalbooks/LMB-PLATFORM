// Donations & tips (beta; LMB-PLATFORM tasks/todo/2026-11-18-giving-g1.md): what the owner set up for giving, what a gift
// may be, what covering the card fee adds and who the giver is. One source for the admin, the shop's Support page and
// the server (functions/shared/givingRules.js is a generated copy; functions/giving.js keeps the records).
//
// A gift is money given, not something bought: it carries no sales tax, and the card page charges the gift plus the
// card fee when the giver chose to cover it. The lowest gift is MIN_GIFT_MINOR, so a stolen card can't be tried with a
// few cents (the server also limits how often one visitor or one email may open a card page).

import { cleanCharity, type Charity } from "./charityReceipts";

/** The lowest gift: small enough for anyone, too big for a run of stolen-card tries to go unnoticed. */
export const MIN_GIFT_MINOR = 500;
/** The highest gift one card page takes. */
export const MAX_GIFT_MINOR = 1_000_000;
/** How many suggested amounts the page shows. */
export const MAX_AMOUNTS = 6;
export const DEFAULT_AMOUNTS: readonly number[] = Object.freeze([1000, 2500, 5000, 10000]);
/** The card fee a giver may cover: an estimate of the usual card rate, a percent plus a fixed part. */
export const CARD_FEE_PERCENT = 2.9;
export const CARD_FEE_FIXED_MINOR = 30;
export const MAX_NOTE = 500;
/** Tips at checkout: the percents offered when the owner hasn't chosen, and the bounds of one tip. */
export const DEFAULT_TIP_PERCENTS: readonly number[] = Object.freeze([5, 10, 15]);
export const MAX_TIP_CHOICES = 4;
export const MIN_TIP_MINOR = 100;
export const MAX_TIP_MINOR = 100_000;
export const MAX_THANKS = 600;

export type GivingSettings = {
  /** Suggested amounts in cents, smallest first. */
  amounts: number[];
  /** The giver may type their own amount. */
  otherAmount: boolean;
  /** The giver may add the card fee so the shop gets the whole gift. */
  coverFee: boolean;
  /** The giver may give in honour or in memory of someone. */
  honour: boolean;
  /** The owner's own words in the thank-you email (blank: only the standard thanks). */
  thanks: string;
  /** Checkout asks for a tip on every order (no sales tax, kept apart from sales). */
  checkoutTip: boolean;
  /** The tip choices at checkout, in whole percents of the items, smallest first. */
  tipPercents: number[];
  /** A registered charity's details: tax receipts are given only while this is set (G3, charityReceipts.ts). */
  charity: Charity | null;
  /** Each January, everyone who gave last year gets a summary of their gifts and receipts. */
  yearlySummary: boolean;
};

export type Honour = { kind: "honour" | "memory"; name: string };
export type Giver = { name: string; email: string; anonymous: boolean; honour: Honour | null; note: string };

export const GIVING_MESSAGES = Object.freeze({
  off: "This shop isn't taking gifts right now.",
  tooSmall: (min: string) => `The lowest gift is ${min}.`,
  tooBig: (max: string) => `The highest gift is ${max}. For more, please contact the shop.`,
  amount: "Please choose an amount.",
  name: "Please add your name.",
  email: "Please add an email address we can send your thank-you to.",
  honourName: "Please add the name of the person you're giving for.",
});

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const block = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A whole number of cents from what was typed or saved, or NaN. */
export function centsOf(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : NaN;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) return Number(value.trim());
  return NaN;
}

/** The owner's settings as saved, always usable: anything missing or out of range falls back to the defaults. */
export function cleanGivingSettings(raw: unknown): GivingSettings {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(s.amounts) ? s.amounts : [];
  const amounts = [...new Set(list.map(centsOf).filter((n) => n >= MIN_GIFT_MINOR && n <= MAX_GIFT_MINOR))].sort((a, b) => a - b).slice(0, MAX_AMOUNTS);
  const otherAmount = s.otherAmount !== false;
  return {
    // With no amounts and no other amount there would be nothing to give, so the defaults come back.
    amounts: amounts.length || otherAmount ? amounts : [...DEFAULT_AMOUNTS],
    otherAmount,
    coverFee: s.coverFee !== false,
    honour: s.honour !== false,
    thanks: block(s.thanks, MAX_THANKS),
    checkoutTip: s.checkoutTip === true,
    tipPercents: cleanTipPercents(s.tipPercents),
    charity: (() => { const c = cleanCharity(s.charity); return "charity" in c ? c.charity : null; })(),
    yearlySummary: s.yearlySummary !== false,
  };
}

/** 1 to 4 whole percents from 1 to 50, smallest first; anything else is the defaults. */
export function cleanTipPercents(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [];
  const percents = [...new Set(list.map(centsOf).filter((n) => n >= 1 && n <= 50))].sort((a, b) => a - b).slice(0, MAX_TIP_CHOICES);
  return percents.length ? percents : [...DEFAULT_TIP_PERCENTS];
}

/** Each tip choice in cents: that percent of the items (after any discount), rounded to the cent. */
export function tipChoices(baseMinor: number, percents: readonly number[]): { percent: number; minor: number }[] {
  const base = Math.max(0, Math.round(Number(baseMinor) || 0));
  return percents.map((percent) => ({ percent, minor: Math.round((base * percent) / 100) }));
}

/** Why this tip can't be taken, or null. Nothing (0) is always fine; a tip is whole cents from $1 to $1,000. */
export function checkoutTipProblem(tipMinor: unknown): "tip" | "tipTooSmall" | "tipTooBig" | null {
  if (tipMinor === undefined || tipMinor === null || tipMinor === 0) return null;
  if (typeof tipMinor !== "number" || !Number.isInteger(tipMinor) || tipMinor < 0) return "tip";
  if (tipMinor < MIN_TIP_MINOR) return "tipTooSmall";
  if (tipMinor > MAX_TIP_MINOR) return "tipTooBig";
  return null;
}

/** The settings a shop starts with. */
export const startingGivingSettings = (): GivingSettings => ({ amounts: [...DEFAULT_AMOUNTS], otherAmount: true, coverFee: true, honour: true, thanks: "", checkoutTip: false, tipPercents: [...DEFAULT_TIP_PERCENTS], charity: null, yearlySummary: true });

/** Why this amount can't be given (`code` says which), or null. The settings decide whether a typed amount is allowed. */
export function giftAmountProblem(amountMinor: unknown, settings: GivingSettings): { code: "amount" | "tooSmall" | "tooBig" } | null {
  const n = centsOf(amountMinor);
  if (!Number.isFinite(n) || n <= 0) return { code: "amount" };
  if (n < MIN_GIFT_MINOR) return { code: "tooSmall" };
  if (n > MAX_GIFT_MINOR) return { code: "tooBig" };
  if (!settings.otherAmount && !settings.amounts.includes(n)) return { code: "amount" };
  return null;
}

/**
 * What covering the card fee adds to a gift, so that after the card company takes its part the shop has the whole gift:
 * (gift + fixed) / (1 − percent) − gift, rounded up to the cent.
 */
export function coverFeeMinor(amountMinor: number): number {
  const n = Math.round(Number(amountMinor) || 0);
  if (n <= 0) return 0;
  return Math.ceil((n + CARD_FEE_FIXED_MINOR) / (1 - CARD_FEE_PERCENT / 100)) - n;
}

/** What the card page charges: the gift, plus the card fee when the giver covers it and the shop offers that. */
export function giftCharge(amountMinor: number, cover: unknown, settings: GivingSettings): { amountMinor: number; feeMinor: number; chargedMinor: number } {
  const feeMinor = cover === true && settings.coverFee ? coverFeeMinor(amountMinor) : 0;
  return { amountMinor, feeMinor, chargedMinor: amountMinor + feeMinor };
}

/** The giver as sent from the page, or the problem in plain words. Honour only when the shop offers it. */
export function cleanGiver(raw: unknown, settings: GivingSettings): Giver | { problem: string; code: string } {
  const g = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = text(g.name, 100);
  if (!name) return { problem: GIVING_MESSAGES.name, code: "name" };
  const email = text(g.email, 320).toLowerCase();
  if (!EMAIL.test(email)) return { problem: GIVING_MESSAGES.email, code: "email" };
  let honour: Honour | null = null;
  const h = g.honour && typeof g.honour === "object" ? (g.honour as Record<string, unknown>) : null;
  if (settings.honour && h && (h.kind === "honour" || h.kind === "memory")) {
    const who = text(h.name, 100);
    if (!who) return { problem: GIVING_MESSAGES.honourName, code: "honour" };
    honour = { kind: h.kind, name: who };
  }
  return { name, email, anonymous: g.anonymous === true, honour, note: block(g.note, MAX_NOTE) };
}

/** How a gift is shown to anyone but the owner: the giver's first name, or "Anonymous" when they asked. */
export function giverShown(giver: Pick<Giver, "name" | "anonymous">, anonymousWord = "Anonymous"): string {
  if (giver.anonymous) return anonymousWord;
  return giver.name.split(" ")[0] || anonymousWord;
}
