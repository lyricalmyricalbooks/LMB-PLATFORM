import type { AppUpdate } from "../appUpdates";

export default {
  id: "currency-from-visitor-country",
  date: "2026-10-12",
  title: "Prices start in the shopper's own currency",
  summary:
    "On a first visit the shop now asks its own server which country the shopper is connecting from and starts prices in CAD (Canada), USD (the US and the rest of the Americas) or EUR (Europe). Nothing is sent to an outside location service. Until the answer arrives, or if Google's servers don't report a country, the old guess from the shopper's time zone is used. A currency the shopper picks in the currency menu always wins and is remembered. What they pay is unchanged: the CAD price at today's rate, as before. Needs the updated Functions deployed with the storefront.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
