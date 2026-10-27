import type { AppUpdate } from "../appUpdates";

export default {
  id: "bug-sweep-5", date: "2026-10-08", title: "Safer cancelling, disputes and checkout retries",
  summary: "Cancelling an unpaid order now stops its card payment and frees its books. Disputed orders wait in Needs attention, and orders paid after cancelling clear with Mark refunded. Shoppers can retry checkout without their own earlier attempt holding stock, and the bag's free-shipping bar follows your shipping rules.",
  links: [{ label: "Review orders", tab: "orders" }, { label: "Check free-shipping rules", tab: "settings", settingsTab: "shipping" }, { label: "Review discounts", tab: "discounts" }],
} satisfies AppUpdate;
