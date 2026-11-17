import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-profiles-workspace",
  date: "2026-11-17",
  title: "A new, simpler Shipping page",
  summary: "Shipping profiles now live on one page. Pick a profile on the left, then choose its books, where it ships and the price, all in one place. Places are picked by tapping continents, countries, provinces and states, and Try it shows what a customer would pay before you save. New profiles start with their books first. Nothing goes live until you press Save.",
  links: [{ label: "Shipping profiles", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
