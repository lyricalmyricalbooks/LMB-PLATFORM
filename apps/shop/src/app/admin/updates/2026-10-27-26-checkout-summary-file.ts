import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-summary-file",
  date: "2026-10-27",
  title: "Checkout's order summary has its own file",
  summary: "Behind the scenes, the order summary beside checkout (the books, any free gift, the subtotal, discount, shipping, tax, gift cards and total, and the tap-to-open bar on phones) moved into a file of its own. Every amount is still worked out the same way, and the charge itself is still set on the server.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
