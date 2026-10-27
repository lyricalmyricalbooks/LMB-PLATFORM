import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-release-countdown",
  date: "2026-10-23",
  title: "Optional release countdown on pre-order book pages",
  summary:
    "Like Shopify pre-order apps' launch timers, a pre-order book with a publication date (Books › edit › Inventory › Pre-order) can now count down to its release in the last hours: “Pre-order · out in 2d 5h” replaces “Pre-order · ships November 3”, updating as shoppers watch, and goes back to the usual words once release day arrives. It counts to the real release (midnight Toronto time on the publication date), never a made-up deadline. You choose how many hours before release it starts (72 by default). It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
