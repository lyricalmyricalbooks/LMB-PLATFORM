import type { AppUpdate } from "../appUpdates";

export default {
  id: "auto-tracking-link",
  date: "2026-10-11",
  title: "Tracking link fills itself in",
  summary: "When you confirm dispatch, the tracking link is now filled in from the carrier and tracking number (Canada Post, Purolator, UPS, FedEx, DHL, USPS, Canpar). You can still replace it with your own link.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
