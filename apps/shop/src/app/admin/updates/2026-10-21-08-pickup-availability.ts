import type { AppUpdate } from "../appUpdates";

export default {
  id: "pickup-availability",
  date: "2026-10-21",
  title: "“Pickup available at …” on book pages (off until you switch it on)",
  summary: "Book pages can say a printed book can be picked up, like Shopify's pickup availability: “Pickup available at <your location>”, its ready-by estimate, and a View pickup details link with each location's town, fee and hours. It uses your own pickup locations from Settings › Shipping › Local pickup & delivery and only shows while Local pickup is on, for printed editions in stock (never e-books or gift cards). Checkout and prices don't change. It is off by default, so the live shop doesn't change. To try it: Studio › Theme settings › Book page · photos & layout › Extras on the page › Pickup availability. Its words are in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer" }, { label: "Local pickup settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
