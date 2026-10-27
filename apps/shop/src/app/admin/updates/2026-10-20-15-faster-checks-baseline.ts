import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-checks-baseline",
  date: "2026-10-20",
  title: "Design studio control check: three masthead settings recorded correctly",
  summary: "Maintenance only: after the Design studio control check was split across machines, three shop-masthead settings (masthead text, its letter case and its desktop size) showed as broken. They only draw with the Reference header, which the shop doesn't use, and the check now records that. Nothing in the admin or the shop looks different.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
