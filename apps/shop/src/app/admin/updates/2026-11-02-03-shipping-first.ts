import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-first",
  date: "2026-11-02",
  title: "Set up shipping in the first steps",
  summary: "A new shop's setup now confirms your shipping before the shop's own checklist. Your orders ship from the address you gave first, and a starting set of delivery prices is suggested for your country. Nothing new is added if you already have shipping, and you can set it up later. Your look's previews also show your first book's photo.",
  links: [{ label: "Open Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
