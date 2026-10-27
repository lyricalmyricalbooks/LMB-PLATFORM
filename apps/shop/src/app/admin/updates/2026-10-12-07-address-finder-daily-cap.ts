import type { AppUpdate } from "../appUpdates";

export default {
  id: "address-finder-daily-cap",
  date: "2026-10-12",
  title: "Google address finder stays inside the free allowance",
  summary:
    "The shop now uses your Google key for at most 300 address lookups a day (about 9,000 a month), below Google's 10,000 free requests a month. On a busier day, checkout switches to the free OpenStreetMap suggestions until the next day, so shoppers can always enter their address. Set up the key in Settings › Shipping › Carrier & labels › Address finder at checkout.",
  links: [{ label: "Open the address finder", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
