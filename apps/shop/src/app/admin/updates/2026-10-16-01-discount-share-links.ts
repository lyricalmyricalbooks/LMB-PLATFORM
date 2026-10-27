import type { AppUpdate } from "../appUpdates";

export default {
  id: "discount-share-links",
  date: "2026-10-16",
  title: "Share a discount with one link",
  summary: "When you create a discount code, a Share window now opens with a link to the shop that fills the code in at checkout. Copy it into an email, newsletter or social post. Every code in the Discounts list also has a Share link button next to it. Checkout still checks the code's rules, so a link for a paused, expired or used-up code simply takes nothing off, and the Share window warns you when the code isn't active.",
  links: [{ label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
