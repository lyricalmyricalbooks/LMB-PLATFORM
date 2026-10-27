import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-view",
  date: "2026-10-20",
  title: "Quick view on shop cards (off until you switch it on)",
  summary: "Shoppers can open a pop-up from a book card to see the photo, price, a short description and Add to bag without leaving the shop grid. It is off by default, so nothing changes on the live shop. To try it: Studio › Theme settings › Book cards in the shop grid › Quick view button, then check the preview. Its words are in Text & labels › Catalog & empty states.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer" }],
} satisfies AppUpdate;
