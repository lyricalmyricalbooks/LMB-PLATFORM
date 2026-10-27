import type { AppUpdate } from "../appUpdates";

export default {
  id: "gift-card-safety-fixes", date: "2026-10-09", title: "Safer gift cards and box sets",
  summary: "Fixes found in a review of the new gift cards. A gift card from a test-mode purchase can no longer pay for a real order. If a shopper changes their bag and tries again, their own earlier attempt no longer blocks their gift card. A card payment always takes exactly the gift card amount it was made for. An order flagged \"Gift card couldn't cover its part\" now clears itself when you refund the payment in Stripe, or with the new Mark resolved button. A full refund is refused once a gift card the order bought has been spent, so that money isn't given back twice. Refunding an order paid by gift card now says the balance went back to the card. A new alert appears if someone paid for a gift card but no code was created. A box set that contains a pre-order book now waits for that book's release before it ships. Tested with local checks only.",
  links: [{ label: "Open Gift cards", tab: "giftCards" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
