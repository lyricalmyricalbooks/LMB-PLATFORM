import type { AppUpdate } from "../appUpdates";

export default {
  id: "router-security-update",
  date: "2026-10-14",
  title: "Page-navigation library security update",
  summary: "The library that moves shoppers between pages (React Router) was updated from 7.13 to 7.18, which clears several published security advisories. Nothing looks different and no settings changed. This was checked with the automated tests and a local build; it takes effect for shoppers once the storefront is next deployed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
