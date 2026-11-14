import type { AppUpdate } from "../appUpdates";

export default {
  id: "free-ship-hint-physical",
  date: "2026-11-14",
  title: "Free-shipping hint at checkout counts only things that ship",
  summary: "The \"spend a little more for free shipping\" line at checkout now leaves out e-books, downloads and gift cards, the same way the bag and your shipping prices already do. It no longer promises free shipping that checkout then doesn't give.",
  links: [{ label: "Open Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
