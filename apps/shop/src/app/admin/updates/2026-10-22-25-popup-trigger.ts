import type { AppUpdate } from "../appUpdates";

export default {
  id: "popup-trigger",
  date: "2026-10-22",
  title: "Choose when the pop-up opens",
  summary:
    "Like the email pop-up apps Shopify shops use, your pop-up window can now open at a better moment than a fixed delay: when a shopper on a computer moves their mouse up towards the tabs to leave (a last chance to offer a newsletter or a code), or once they have scrolled part way down the page (so they have seen what you sell first). Phones have no mouse, so with “about to leave” they keep using the delay. It still waits for the cookie answer and still follows How often it shows. Nothing changes until you pick a new option in Design › Theme settings › Pop-up window › When it opens; the pop-up itself only appears once you add sections to it in Page layout › Pop-up.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
