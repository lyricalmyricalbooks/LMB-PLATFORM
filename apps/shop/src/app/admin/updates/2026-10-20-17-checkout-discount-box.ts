import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-discount-box",
  date: "2026-10-20",
  title: "Choose whether checkout shows the discount code box",
  summary: "Theme settings › Checkout page › What shoppers see has a new switch, Discount code box at checkout. Turn it off to stop shoppers who have no code from hunting for one; anyone who arrives through a shared discount link, or has a code applied, still sees the box so they can check or remove it. The box is also a part of its own now: click it in the checkout preview to change its spacing or hide it on phones only. The switch starts on, so checkout looks the same until you change it. Prices and discounts are still worked out by the server as before.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
