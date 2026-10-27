import type { AppUpdate } from "../appUpdates";

export default {
  id: "better-address-finder",
  date: "2026-10-12",
  title: "A much better address finder at checkout",
  summary:
    "The suggestions under the street box at checkout are smarter. They understand units (“12-456 Montrose Ave”, “Apt 3”, “#7”), abbreviations like St, Ave and W, put the house number the shopper typed first, look near the province they picked, and no longer leave an old postal code behind when a shopper picks a different address. A unit typed in the street box fills the Apartment or unit box. The free suggestions still come from OpenStreetMap, which is missing many Canadian house numbers and postal codes. For complete addresses with postal codes, add a Google Maps Platform key in Settings › Shipping › Carrier & labels › Address finder at checkout (steps are on the card; Google bills lookups beyond its monthly free allowance). The key stays on the shop's server and needs the updated Cloud Functions deployed; until then checkout keeps using the free suggestions.",
  links: [{ label: "Set up the address finder", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
