import type { AppUpdate } from "../appUpdates";

export default {
  id: "guest-billing-checkout",
  date: "2026-10-29",
  title: "Guest checkout no longer refused by the order check",
  summary: "When a shopper paid as a guest, the shop's safety check on new orders could run out of room while checking the billing part of the order, and refuse the order before payment. The billing part is now checked as the two fields checkout actually sends, so guest orders go through again. Nothing changes in what shoppers fill in or what is checked.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
