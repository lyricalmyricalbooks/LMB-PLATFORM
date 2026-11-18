// The Support page inside Studio's preview: sample amounts and a sample paid gift, so an owner can design the page and the
// thank-you before anyone gives, and whether or not Donations & tips is switched on. Only a real Studio preview gets these
// (bookTimePreview.ts `isBookingPreview`); no card page opens and nothing is saved.
import { coverFeeMinor, DEFAULT_AMOUNTS, MAX_GIFT_MINOR, MIN_GIFT_MINOR } from "../../../shared/givingRules";
import type { GiftView, GivingInfo } from "./supportRules";
import { dayAfter, type PublicFundraiser } from "../../../shared/fundraiserRules";
import { cleanReceiptAddress, type Charity } from "../../../shared/charityReceipts";

const SAMPLE_CHARITY: Charity = { kind: "ca", number: "123456789 RR 0001", name: "Sample Press Arts Society", address: "1 Sample St, Toronto ON", signer: "Ada Example" };

export const SAMPLE_GIFT_ID = "sample-gift";
export const SAMPLE_GIFT_KEY = "0".repeat(48);

let sample: GiftView | null = null;

const today = () => new Date().toISOString().slice(0, 10);
/** `fundraiser=sample` on the preview's address, or on Studio's own around it, shows a sample fundraiser, so its bar, story
 *  and wall can be checked before one runs. */
function sampleFundraiserAsked(): boolean { return sampleAsked("fundraiser"); }
/** `receipts=sample` likewise shows the tax receipt tick box and a sample receipt after giving (G3). */
function sampleReceiptsAsked(): boolean { return sampleAsked("receipts"); }
function sampleAsked(name: string): boolean {
  if (typeof window === "undefined") return false;
  const asks = (search: string) => new URLSearchParams(search).get(name) === "sample";
  try { return asks(window.location.search) || (window.parent !== window && asks(window.parent.location.search)); } catch { return asks(window.location.search); }
}
const SAMPLE_FUNDRAISER = (day: string): PublicFundraiser => ({
  id: "sample-fundraiser", title: "Reprint our first book", goalMinor: 300000, raisedMinor: 187500, supporters: 42, endsOn: dayAfter(day, 20), state: "live",
  story: "Our first book sold out in a month. With your help we can print 500 more on the same paper.\n\nEvery gift counts toward the reprint.",
  showWall: true, wall: [{ name: "Ada Reader", at: "" }, { name: "Ben Example", at: "" }, { name: "Cleo Example", at: "" }],
  rewards: [
    { id: "rw1", title: "Thank-you postcard", description: "A risograph postcard with a note from us.", minMinor: 1000, ships: false, when: "", left: null, gone: false },
    { id: "rw2", title: "Signed print", description: "An A4 print from the book, signed and numbered.", minMinor: 5000, ships: true, when: "January", left: 4, gone: false },
    { id: "rw3", title: "Your name in the book", description: "", minMinor: 15000, ships: false, when: "Spring 2027", left: 0, gone: true },
  ],
});

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
      ...(sampleFundraiserAsked() ? { today: today(), fundraiser: SAMPLE_FUNDRAISER(today()) } : {}),
      ...(sampleReceiptsAsked() ? { receipts: { kind: SAMPLE_CHARITY.kind } } : {}),
    } satisfies GivingInfo;
  }
  if (action === "giftStart") {
    const amount = Math.round(Number(body.amountMinor)) || 2500;
    const giver = body.giver || {};
    sample = sampleGift(currency, amount, body.coverFee === true, String(giver.name || "Ada Reader"), giver.honour?.name ? { kind: giver.honour.kind === "memory" ? "memory" : "honour", name: String(giver.honour.name) } : null, giver.anonymous === true);
    const r = body.rewardId ? SAMPLE_FUNDRAISER(today()).rewards.find((x) => x.id === body.rewardId) : null;
    if (r) sample = { ...sample, reward: { title: r.title, ships: r.ships, when: r.when, sent: false } };
    if (!r && body.receipt === true && sampleReceiptsAsked()) {
      sample = { ...sample, receipt: { number: "2026-00001", year: Number(today().slice(0, 4)), issuedOn: today(), receivedOn: today(), eligibleMinor: sample.chargedMinor,
        currency, name: sample.name, address: cleanReceiptAddress(body.receiptAddress), status: "issued", cancelledOn: "", replaces: "", test: false } };
    }
    return { giftId: SAMPLE_GIFT_ID, key: SAMPLE_GIFT_KEY, preview: true };
  }
  sample ||= sampleGift(currency);
  return { gift: sample, charity: sample.receipt ? SAMPLE_CHARITY : null };
}
