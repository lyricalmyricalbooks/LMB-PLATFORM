import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-google-sheet",
  date: "2026-11-04",
  title: "Your stock and sales in a Google Sheet, with your one Google sign-in",
  summary: "Settings, Google Sheet in the stockroom now makes a sheet in your own Google Drive with two tabs: Stock, with each product's count, and Sales, with every sale you recorded. It uses the Google account you connected in Settings, Google, so there is nothing to paste or set up. Press Send now, or let it refresh by itself when it is more than six hours old. It goes one way: typing in the sheet never changes your stock, and a sale you void drops off at the next send.",
  links: [{ label: "Open Google settings", tab: "settings", settingsTab: "google" }],
} satisfies AppUpdate;
