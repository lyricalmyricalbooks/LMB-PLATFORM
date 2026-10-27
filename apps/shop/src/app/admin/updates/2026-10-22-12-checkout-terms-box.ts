import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-terms-box",
  date: "2026-10-22",
  title: "Optional “I agree to the policies” tick box at checkout",
  summary:
    "Like Shopify's “Require customers to agree to terms”, checkout can now show a tick box just above the Pay button: “I have read and agree to the” followed by links to your Refund, Shipping and other policies. Until it is ticked, Pay shows a reminder next to the box and Apple Pay / Google Pay stay greyed out. It is off until you switch it on in Design › Theme settings › Checkout page › What shoppers see, and it only appears once at least one policy is written in Settings › General › Policies, so the live shop is unchanged. The words are in Text & labels › Checkout. Prices, payments and the order itself are unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
