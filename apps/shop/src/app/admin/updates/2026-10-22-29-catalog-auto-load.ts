import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-auto-load",
  date: "2026-10-22",
  title: "Optional: more books load by themselves as shoppers scroll",
  summary:
    "Like the “infinite scroll” many Shopify themes offer, the shop grid can now bring in the next books by itself when a shopper scrolls down to the “Show more books” button, so browsing a long list doesn't need a press each time. After four automatic loads the button comes back, so shoppers can still reach the footer, and keyboard users can always press it. It only works when the shop shows a set number of books before “Show more”, and it is off until you switch it on in Design › Theme settings › Shop page heading & filters › Show more button, so the live shop is unchanged.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
