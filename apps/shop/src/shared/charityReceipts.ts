// Tax receipts for registered charities (Donations & tips G3, Beta, 18 November 2026; LMB-PLATFORM
// tasks/todo/2026-11-18-giving-g3.md). One source for the shop and the server (functions/shared/charityReceipts.js).
//
// A shop gives receipts only once the owner enters a registration number: a Canadian charity's business number
// (123456789 RR 0001) or a US tax ID (12-3456789). The kind of number decides the receipt's wording. Numbers run in
// order each year (2026-00001), are given out by the server inside the transaction that marks the gift paid, and are
// never reused: a refund cancels the receipt, and correcting a name or address cancels it and issues a new number that
// names the one it replaces. A gift that came with a thank-you reward gets no receipt (the reward has value, so the
// gift isn't wholly a gift). A Canadian receipt needs the giver's address, so the Support page asks for it.
import { addressMissing } from "./addressRules";

export type CharityKind = "ca" | "us";
export type Charity = { kind: CharityKind; number: string; name: string; address: string; signer: string };
export type ReceiptAddress = { street: string; street2: string; city: string; state: string; zip: string; country: string };
export type Receipt = {
  number: string; year: number; issuedOn: string; receivedOn: string; eligibleMinor: number; currency: string;
  name: string; address: ReceiptAddress | null; status: "issued" | "cancelled"; cancelledOn: string; replaces: string; test: boolean;
};

export const MAX_CHARITY_NAME = 120;
export const MAX_CHARITY_ADDRESS = 240;
export const MAX_SIGNER = 80;

export const CHARITY_MESSAGES = Object.freeze({
  number: "Enter your registration number as the Canada Revenue Agency shows it (123456789 RR 0001), or your US tax ID (12-3456789).",
  name: "Enter your charity's legal name, as it is registered.",
  address: "Enter your charity's address, as it is registered.",
  signer: "Enter the name of the person who signs your receipts.",
  receiptAddress: "Add your address for the tax receipt, or untick the receipt.",
});

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** What kind of number this is, written the usual way, or null when it is neither. Pure. */
export function charityNumber(raw: unknown): { kind: CharityKind; number: string } | null {
  const v = String(raw ?? "").toUpperCase().replace(/\s+/g, "");
  const ca = /^(\d{9})RR(\d{4})$/.exec(v);
  if (ca) return { kind: "ca", number: `${ca[1]} RR ${ca[2]}` };
  const us = /^(\d{2})-?(\d{7})$/.exec(v);
  if (us) return { kind: "us", number: `${us[1]}-${us[2]}` };
  return null;
}

/**
 * The owner's charity details, or null when receipts are off (`on` false or nothing given), or why they can't be saved.
 * The server refuses a bad one when the owner saves; a bad stored one reads as receipts off (`cleanGivingSettings`).
 */
export function cleanCharity(raw: unknown): { charity: Charity | null } | { problem: string; field: string } {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!c || c.on === false) return { charity: null };
  const n = charityNumber(c.number);
  if (!n) return { problem: CHARITY_MESSAGES.number, field: "number" };
  const name = text(c.name, MAX_CHARITY_NAME);
  if (!name) return { problem: CHARITY_MESSAGES.name, field: "name" };
  const address = text(c.address, MAX_CHARITY_ADDRESS);
  if (!address) return { problem: CHARITY_MESSAGES.address, field: "address" };
  const signer = text(c.signer, MAX_SIGNER);
  if (n.kind === "ca" && !signer) return { problem: CHARITY_MESSAGES.signer, field: "signer" };
  return { charity: { kind: n.kind, number: n.number, name, address, signer } };
}

/** The giver's address for a receipt, cleaned, or null when a part is missing. Pure. */
export function cleanReceiptAddress(raw: unknown): ReceiptAddress | null {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!a) return null;
  const out: ReceiptAddress = {
    street: text(a.street, 120), street2: text(a.street2, 120), city: text(a.city, 80), state: text(a.state, 40).toUpperCase(),
    zip: text(a.zip, 20).toUpperCase(), country: text(a.country, 3).toUpperCase(),
  };
  if (!/^[A-Z]{2}$/.test(out.country)) return null;
  return addressMissing(out).length ? null : out;
}

/** "2026-00012", or "TEST-2026-00012" for a test gift (its own run of numbers). Pure. */
export const receiptNumber = (year: number, n: number, test = false) => `${test ? "TEST-" : ""}${year}-${String(n).padStart(5, "0")}`;

/** The counter a receipt number comes from: one per year, and a separate one for test gifts. */
export const receiptCounterId = (year: number, test = false) => `${test ? "test-" : ""}${year}`;

/**
 * Whether a paid gift gets a receipt, and for how much: the whole amount paid (a covered card fee is given too), or 0
 * when it came with a thank-you reward, when receipts are off, or when the giver didn't ask for one. Pure.
 */
export function receiptEligibleMinor(
  gift: { amountMinor?: number; feeMinor?: number; reward?: unknown; receiptAsked?: boolean; receiptAddress?: unknown },
  charity: Charity | null,
): number {
  if (!charity || gift.reward || gift.receiptAsked !== true) return 0;
  if (charity.kind === "ca" && !cleanReceiptAddress(gift.receiptAddress)) return 0;
  return Math.max(0, Math.round(Number(gift.amountMinor) || 0) + Math.round(Number(gift.feeMinor) || 0));
}

/** One line of a receipt address. Pure. */
export const receiptAddressLine = (a: ReceiptAddress | null | undefined): string =>
  (a ? [a.street, a.street2, a.city, [a.state, a.zip].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") : "");
