import type { AppUpdate } from "../appUpdates";

export default {
  id: "orders-tracking-link-oct-2026", date: "2026-10-09", title: "Adding a tracking link to the shipping email is easier",
  summary: "When an order is ready to ship, press Enter tracking & mark shipped (it used to say \"I made my own label\") to type the carrier, tracking number and, if you like, your own tracking link. That link is what the Track shipment button in the customer's shipping email opens; leave it blank and the email uses the carrier's own tracking page. Orders with a Shippo label now show the same box before you mark them shipped, so you can check or change the link. After an order ships you can fix the link from Edit tracking (or Edit tracking link for Shippo orders), and the order shows a Customer's tracking link to check what the customer sees. Fixing a link doesn't send the customer another email; use Resend shipping email if you want them to get the new one.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
