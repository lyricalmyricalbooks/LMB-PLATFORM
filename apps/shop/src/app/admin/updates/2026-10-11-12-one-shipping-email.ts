import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-shipping-email", date: "2026-10-11", title: "One email when a parcel ships",
  summary: "Customers now get just one email for a shipped parcel: \"Your order is on the way!\". The extra \"Delivery Update\" emails (out for delivery, delivered) are no longer sent, whether you mark the order yourself or the carrier reports it; the order still moves to Out for delivery / Delivered in Orders. Pickup and local-delivery orders keep their emails, since they get no shipping email. Takes effect once the Cloud Functions are deployed.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Email templates", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
