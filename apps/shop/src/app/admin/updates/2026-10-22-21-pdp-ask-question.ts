import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-ask-question",
  date: "2026-10-22",
  title: "Optional “Ask a question about this book” on book pages",
  summary:
    "Like the question box many Shopify themes add to product pages, book pages can now show a small “Ask a question about this book” link under the buy buttons. It opens a short form (name, email, question); what shoppers send arrives in Messages with the book's title in the subject, and you reply from there as usual. It shows on every book, sold out or not, and the Design preview never sends anything. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page › Ask a question. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Open Messages", tab: "messages" },
  ],
} satisfies AppUpdate;
