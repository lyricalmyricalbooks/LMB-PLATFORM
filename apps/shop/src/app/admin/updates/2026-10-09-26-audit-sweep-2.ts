import type { AppUpdate } from "../appUpdates";

export default {
  id: "audit-sweep-2", date: "2026-10-09", title: "Safer payments, fewer stuck orders and less spam through the shop",
  summary: "Card payments now use exactly the amount the shop's server worked out, so USD and EUR card payments should no longer fail over a cent of rounding, and the confirmation email shows the same total the card was charged. If a shopper's earlier payment already went through, a second try is refused and they are shown their paid order, instead of being charged again on a new order. A card form left open for more than 25 minutes asks the server again before charging, so nobody pays for a copy whose hold has run out. If Stripe reports that a refund failed, the order goes back to paid with its stock and totals put back, and you can refund it again. In Orders, a label purchase Shippo refused no longer locks the order; if a label purchase is uncertain, check Shippo and press \"I've checked Shippo — allow a new label\". Order emails are sent once even if Firebase delivers an event twice. Saving a book only writes the fields you changed, so a category or stock change made elsewhere is kept. The contact form and new-account welcome email can no longer be used to send messages to strangers, and one shopper can no longer hold all the stock of a book. After deploying, open Settings › Payments › Stripe and press Fix webhook so Stripe sends refund updates. Deploy Firestore rules and Cloud Functions with this frontend. Tested with local checks only.",
  links: [
    { label: "Open Orders", tab: "orders" },
    { label: "Open payment settings", tab: "settings", settingsTab: "payments" },
  ],
} satisfies AppUpdate;
