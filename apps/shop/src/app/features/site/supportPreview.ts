// The Support page inside Studio's preview: sample amounts and a sample paid gift, so an owner can design the page and the
// thank-you before anyone gives, and whether or not Donations & tips is switched on. Only a real Studio preview gets these
// (bookTimePreview.ts `isBookingPreview`); no card page opens and nothing is saved.
import { coverFeeMinor, DEFAULT_AMOUNTS, MAX_GIFT_MINOR, MIN_GIFT_MINOR } from "../../../shared/givingRules";
import type { GiftView, GivingInfo } from "./supportRules";

export const SAMPLE_GIFT_ID = "sample-gift";
export const SAMPLE_GIFT_KEY = "0".repeat(48);

let sample: GiftView | null = null;

function sampleGift(currency: string, amountMinor = 2500, cover = true, name = "Ada Reader", honour: GiftView["honour"] = null, anonymous = false): GiftView {
  const feeMinor = cover ? coverFeeMinor(amountMinor) : 0;
  return {
    id: SAMPLE_GIFT_ID, status: "paid", amountMinor, feeMinor, chargedMinor: amountMinor + feeMinor, currency, name, anonymous, honour,
    paidAt: new Date().toISOString(), refunded: false,
  };
}

export function previewGivingAnswer(action: string, body: Record<string, any> = {}, currency = "CAD"): Record<string, any> {
  if (action === "givingInfo") {
    return {
      on: true, currency, minMinor: MIN_GIFT_MINOR, maxMinor: MAX_GIFT_MINOR, cardsReady: true, amounts: [...DEFAULT_AMOUNTS],
      otherAmount: true, coverFee: true, honour: true, form: "preview",
    } satisfies GivingInfo;
  }
  if (action === "giftStart") {
    const amount = Math.round(Number(body.amountMinor)) || 2500;
    const giver = body.giver || {};
    sample = sampleGift(currency, amount, body.coverFee === true, String(giver.name || "Ada Reader"), giver.honour?.name ? { kind: giver.honour.kind === "memory" ? "memory" : "honour", name: String(giver.honour.name) } : null, giver.anonymous === true);
    return { giftId: SAMPLE_GIFT_ID, key: SAMPLE_GIFT_KEY, preview: true };
  }
  sample ||= sampleGift(currency);
  return { gift: sample };
}
