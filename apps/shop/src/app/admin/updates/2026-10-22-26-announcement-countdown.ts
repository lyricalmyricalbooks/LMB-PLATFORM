import type { AppUpdate } from "../appUpdates";

export default {
  id: "announcement-countdown",
  date: "2026-10-22",
  title: "Countdown in the announcement bar",
  summary:
    "Like the countdown-timer bars many Shopify shops use for a limited offer, an announcement message with an end day can now say how long is left — “Ends in 1d 4h”, then “Ends in 3h 20m”, then “Ends in 12 min” — in its last few days. It counts to midnight (Toronto time) at the end of the message's Show until day and disappears with the message. Nothing changes until you switch on Design › Theme settings › Header & announcement bar › Announcement countdown; set a message's Show until day under Announcement messages, and change the words in Text & labels › Header.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
