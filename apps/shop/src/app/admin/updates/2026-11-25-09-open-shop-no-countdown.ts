import type { AppUpdate } from "../appUpdates";

export default {
  id: "open-shop-no-countdown",
  date: "2026-11-25",
  title: "An open shop no longer counts steps to open",
  summary: "If your shop is already open, Home no longer says how many steps are left before it opens, and the Open button at the top stops counting them. You see your setup guide instead, with everything still worth doing.",
  links: [{ label: "Home", tab: "overview" }],
} satisfies AppUpdate;
