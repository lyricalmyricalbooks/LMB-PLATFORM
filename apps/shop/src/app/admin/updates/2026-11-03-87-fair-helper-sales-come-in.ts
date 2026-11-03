import type { AppUpdate } from "../appUpdates";

export default {
  id: "fair-helper-sales-come-in",
  date: "2026-11-03",
  title: "Fair helpers can ring up sales on their own phone",
  summary: "You can now add a Fair helper in Settings › Team. They sign in with Google at the address shown there and get only a simple Fair till: your books with prices and copies left, a cart, the ways of paying, and their own sales today. They never see your money, costs, customers, settings or other pages. With no signal their sales wait on their phone and go when the signal is back. Your stockroom adds each sale to your books once, with their name on it, the next time it's open, and the sales then show in Fair today on Home, in All sales and in the evening fair email.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
