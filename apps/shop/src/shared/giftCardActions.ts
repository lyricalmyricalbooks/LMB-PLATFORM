// What the admin's gift card actions send (createStripeCheckoutSession `action: "giftCardAdmin"`, by `op`). The admin
// builds each body with these types and the Functions check it against the same schema before reading or writing a
// card. The schemas pin types and size only; the friendly checks (amount limits, email shape, real dates, a reason
// for every adjustment) stay in handleGiftCardAdmin and functions/giftCards.js.
import { array, boolean, number, object, oneOf, optional, string, type Infer } from "./edge";

const text = (max: number) => optional(string({ max }));
/** A gift card's document id (its handler still checks the exact hash shape). */
const id = string({ min: 1, max: 100, label: "a gift card" });

export const giftCardOp = oneOf(["issue", "setEnabled", "adjust", "setExpiry", "resend", "import"] as const);
export type GiftCardOp = Infer<typeof giftCardOp>;

export const GIFT_CARD_BODIES = {
  issue: object({
    amountMinor: number(),
    recipientEmail: text(320),
    recipientName: text(100),
    senderName: text(100),
    message: text(300),
    note: text(500),
    expiresOn: text(32),
    sendEmail: optional(boolean()),
  }),
  setEnabled: object({ id, enabled: boolean() }),
  adjust: object({ id, deltaMinor: number(), reason: string({ max: 300 }) }),
  setExpiry: object({ id, expiresOn: string({ max: 32 }), reason: text(300) }),
  resend: object({ id, to: text(320) }),
  /** Bring gift cards over from the old shop (plan 23.5): up to 500 per call, each keyed by `oldRef` so a re-run adds none. */
  import: object({
    cards: array(object({
      oldRef: string({ min: 1, max: 200 }),
      code: text(40),
      balanceMinor: number(),
      expiresOn: text(32),
      recipientEmail: text(320),
      recipientName: text(100),
    }), { max: 500 }),
    sendEmail: optional(boolean()),
  }),
} as const;

export type GiftCardBody<Op extends GiftCardOp> = Infer<(typeof GIFT_CARD_BODIES)[Op]>;
