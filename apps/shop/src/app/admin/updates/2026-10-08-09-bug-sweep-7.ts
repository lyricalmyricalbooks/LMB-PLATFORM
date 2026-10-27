import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-7", date: "2026-10-08", title: "Stock, discounts and prices stay correct",
  summary: "Saving a book no longer puts back a stock count from before a sale, and editing a discount no longer resets how many times it was used. Two discounts can't share a code, and dates show the shop's own day. Books sold in editions show the price shoppers pay, backorder books can be ordered past their stock, and release dates open at midnight in Toronto. Bulk Feature now shows books as featured on the shop, Approve selected only acts on the reviews you can see, and the Orders CSV includes partial refunds. Functions need deploying with this release for the PayPal refund, discount code and email fixes to apply.",
  links: [{ label: "Review books", tab: "catalog" }, { label: "Review discounts", tab: "discounts" }, { label: "Moderate reviews", tab: "reviews" }],
} satisfies AppUpdate;
