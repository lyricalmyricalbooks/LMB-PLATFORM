import type { AppUpdate } from "../appUpdates";

export default {
  id: "commerce-gift-cards-bundles-offers", date: "2026-10-09", title: "Gift cards, box sets, automatic offers, paid extras and sale dates",
  summary: "Five new ways to sell. Gift cards: make a book a gift card (Books › edit › Details › Product type) with amounts like CA$25 or CA$50. Shoppers can send one to a friend, the code is emailed after payment, and it can be spent at checkout through a new Gift card box. You can also issue, disable, top up or resend cards on the new Gift cards page. Box sets: sell several books together at their own price; each set sold takes the books from stock. Automatic offers: discounts that apply without a code, including a free gift with purchase. Only one discount applies per order, and a code a shopper types replaces automatic offers. Paid extras: add a signed copy, personal inscription or gift wrap to a book for a small charge; packing lists show them in bold. Sale dates: a sale price can start and end on its own. Checkout prices all of this on the server. These need the updated Functions and Firestore rules deployed; they have been tested with local checks only, not live payments.",
  links: [
    { label: "Open Gift cards", tab: "giftCards" },
    { label: "Create an automatic offer", tab: "discounts" },
    { label: "Add extras or a box set to a book", tab: "catalog" },
    { label: "Edit the gift card email", tab: "settings", settingsTab: "notifications" },
  ],
} satisfies AppUpdate;
