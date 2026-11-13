import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-currency-known",
  date: "2026-11-13",
  title: "Groundwork: each shop knows its own currency",
  summary: "A first step toward shops that sell in US dollars. Each shop is now told which currency it sells in, taken from the country chosen at sign-up. Nothing you see changes yet: every shop that exists today sells in Canadian dollars and keeps doing so. The next updates make prices, checkout, reports and past orders follow the shop's currency.",
  links: [{ label: "Open Settings", tab: "settings" }],
} satisfies AppUpdate;
