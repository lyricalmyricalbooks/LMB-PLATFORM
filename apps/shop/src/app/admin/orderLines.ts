// How admin order views describe the newer kinds of order line: paid add-ons (signed copy,
// inscription, gift wrap), box sets and their books, gift cards and the free gift, plus the
// automatic-discount label and gift-card payments. Pure, tested; shared by Order detail, the
// packing checklist, packing slips / pick lists and the Orders CSV.

const money = (n: any) => `CA$${(Number(n) || 0).toFixed(2)}`;

/** "Signed copy" / "Personal inscription: “For Sam, love Mum”" — one entry per add-on. */
export function addOnLines(item: any): string[] {
  return (Array.isArray(item?.addOns) ? item.addOns : [])
    .filter((a: any) => a && a.label)
    .map((a: any) => (a.text ? `${a.label}: “${a.text}”` : String(a.label)));
}

/** Books inside one set, e.g. "2 × Title A, 1 × Title B (Hardcover)". */
export function bundlePartsText(item: any): string {
  if (!Array.isArray(item?.components) || !item.components.length) return "";
  return item.components
    .filter((p: any) => p)
    .map((p: any) => `${Math.max(1, Number(p.quantity) || 1)} × ${p.title || p.id}${p.variantName ? ` (${p.variantName})` : ""}`)
    .join(", ");
}

export const isGiftCardLine = (item: any) => item?.giftCard === true;
export const isFreeGiftLine = (item: any) => item?.promoGift === true;

/** "Gift card for sam@x.com" (or the buyer's own email when no recipient was given). */
export function giftCardLineText(item: any, order?: any): string {
  if (!isGiftCardLine(item)) return "";
  const d = item.giftCardDetails || {};
  const to = d.recipientEmail || order?.customer?.email || "";
  const name = d.recipientName ? `${d.recipientName}${to ? ` <${to}>` : ""}` : to;
  return name ? `Gift card for ${name} — emailed, nothing to ship` : "Gift card — emailed, nothing to ship";
}

/** Every extra line of detail to print under an order line, in reading order. */
export function lineDetails(item: any, order?: any): string[] {
  const out: string[] = [];
  if (isFreeGiftLine(item)) out.push("Free gift");
  const parts = bundlePartsText(item);
  if (parts) out.push(`Includes: ${parts}${Number(item?.quantity) > 1 ? " (per set)" : ""}`);
  for (const addOn of addOnLines(item)) out.push(`Add-on: ${addOn}`);
  const gift = giftCardLineText(item, order);
  if (gift) out.push(gift);
  return out;
}

/** "SPRING25" for a code; the shopper-facing title for an automatic offer. */
export function discountLabel(order: any): string {
  const d = order?.appliedDiscount;
  if (!d) return "";
  if (d.automatic || (!d.code && d.title)) return d.title ? `${d.title} (automatic)` : "Automatic offer";
  return String(d.code || "");
}

export const giftCardPaid = (order: any) => Math.max(0, Number(order?.giftCardAmount) || 0);

export type IssuedCard = { id: string; last4: string; minor: number; recipientEmail?: string; lineIndex?: number };
export function issuedGiftCards(order: any): IssuedCard[] {
  return (Array.isArray(order?.giftCardsIssued) ? order.giftCardsIssued : []).filter((c: any) => c && c.id);
}

/** A gift card payment arrived but a card could no longer cover its part: order not marked paid. */
export const giftCardConflictOpen = (order: any) => !!order?.giftCardConflict && !order.giftCardConflict.resolvedAt && order.paymentStatus !== "paid";

/** One CSV-friendly summary of the special lines ("Box Set: Includes …; Book: Add-on: Signed copy"). */
export function lineDetailsSummary(order: any): string {
  return (Array.isArray(order?.items) ? order.items : [])
    .map((item: any) => {
      const details = lineDetails(item, order);
      return details.length ? `${item.title || item.id}: ${details.join("; ")}` : "";
    })
    .filter(Boolean)
    .join(" | ");
}

export { money as cad };

// ── Money on one order (Order detail): line prices, what was charged and refunded ──────────

/** Per-copy price (edition + paid add-ons), the line total, and the add-ons' own prices. */
export function linePricing(item: any): { unit: number; total: number; base: number | null; addOns: { label: string; price: number }[] } {
  const unit = Number(item?.price) || 0;
  const quantity = Math.max(0, Number(item?.quantity) || 0);
  const addOns = (Array.isArray(item?.addOns) ? item.addOns : [])
    .filter((a: any) => a && a.label && Number(a.price) > 0)
    .map((a: any) => ({ label: String(a.label), price: Number(a.price) }));
  const base = item?.basePrice != null && Number.isFinite(Number(item.basePrice)) ? Number(item.basePrice) : null;
  return { unit, total: Math.round(unit * quantity * 100) / 100, base, addOns };
}

/** What the payment was for, in minor units of its currency (mirrors functions/partialRefund.js). */
export function chargedOf(order: any): { minor: number; currency: string } {
  const expected = Number(order?.expectedAmountMinor);
  if (Number.isInteger(expected) && expected > 0) return { minor: expected, currency: String(order.expectedCurrency || order.checkoutCurrency || "CAD").toUpperCase() };
  return { minor: Math.max(0, Math.round((Number(order?.total) || 0) * 100)), currency: String(order?.checkoutCurrency || "CAD").toUpperCase() };
}
export const refundedMinor = (order: any) => Math.max(0, Math.floor(Number(order?.refundedAmountMinor) || 0));
export const refundableMinor = (order: any) => Math.max(0, chargedOf(order).minor - refundedMinor(order));

/** "CA$12.40", "US$9.00", "€5.00". */
export function formatMinor(minor: number, currency = "CAD"): string {
  const code = String(currency || "CAD").toUpperCase();
  const amount = (Number(minor) || 0) / 100;
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).format(amount); }
  catch { return `${amount.toFixed(2)} ${code}`; }
}

/** "12.40" typed by the admin → 1240; anything else → null. */
export function parseMoneyToMinor(text: string): number | null {
  const t = String(text ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/**
 * Suggested refund for a partial return: the price of the copies that came back, in the
 * payment's currency (CAD prices scaled by what the order was charged), capped at what is left.
 */
export function returnedValueMinor(order: any, received: Record<number, number>): number {
  const items = Array.isArray(order?.items) ? order.items : [];
  const valueCad = Object.entries(received || {}).reduce((sum, [index, qty]) => sum + (Number(items[Number(index)]?.price) || 0) * Math.max(0, Number(qty) || 0), 0);
  const charged = chargedOf(order);
  const totalCad = Number(order?.total) || 0;
  const minor = charged.currency === "CAD" || !(totalCad > 0) ? Math.round(valueCad * 100) : Math.round(valueCad * charged.minor / totalCad);
  return Math.min(minor, refundableMinor(order));
}

/** Plain step labels for the return workflow instead of raw state names. */
export function returnStepLabel(state: string): string {
  switch (state) {
    case "requested": return "Step 1 of 4 — decide: approve with instructions, or decline";
    case "approved": return "Step 2 of 4 — waiting for the parcel to come back";
    case "received": return "Step 3 of 4 — inspect what came back";
    case "inspected": return "Step 4 of 4 — refund the customer";
    case "refund_pending": return "Refund sent — waiting for the payment provider";
    case "completed": return "Done — refunded";
    case "closed": return "Closed without a refund";
    case "rejected": return "Declined — the customer has been told why";
    default: return String(state || "").replace(/_/g, " ");
  }
}

export const RETURN_STEPS = ["Decide", "Parcel back", "Inspect", "Refund"] as const;

/** How many of the four return steps are finished (4 = all). -1 hides the tracker: declined or closed returns have no steps left. */
export function returnStepsDone(state: string): number {
  switch (state) {
    case "requested": return 0;
    case "approved": return 1;
    case "received": return 2;
    case "inspected": return 3;
    case "refund_pending":
    case "completed": return 4;
    default: return -1;
  }
}

/** mailto: link with the order number in the subject (encoded), or "" without a usable email. */
export function customerMailto(order: any): string {
  const email = String(order?.customer?.email || "").trim();
  if (!email || /[\s<>"?&]/.test(email)) return "";
  return `mailto:${email}?subject=${encodeURIComponent(`Your order ${order?.orderId || order?.id || ""}`.trim())}`;
}
/** tel: link (digits and a leading +), or "" when the phone has too few digits. */
export function telHref(phone: any): string {
  const raw = String(phone || "").trim();
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return cleaned.replace(/\D/g, "").length >= 3 ? `tel:${cleaned}` : "";
}
