import type { AppUpdate } from "../appUpdates";

export default {
  id: "stock-sheet",
  date: "2026-10-29",
  title: "Your stock list in a Google Sheet, in one click",
  summary: "After you connect Google and tick Your Google Drive, Settings under Visitors & Google gets a Send my stock list button. It makes a Google Sheet in your own Drive with each product's title, author, code, price and how many you have, and updates the same sheet each time you press it. It goes one way, from your stockroom to the sheet, so a number typed into the sheet never changes your real stock.",
  links: [{ label: "Open Google settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
