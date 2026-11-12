import type { AppUpdate } from "../appUpdates";

export default {
  id: "bento-emails",
  date: "2026-11-12",
  title: "Every email in the Colophon look",
  summary: "The emails your shop sends (order confirmations, shipping, refunds, reminders, your own shop alerts) now wear the Colophon look: a cream page, your shop's name or logo on a coloured tile, the words on a white tile with round corners and black round buttons. The tile is mint unless you pick your own colour in Email branding. Colophon's own emails to you (receipts, trial and sign-in) got the same look, in English and French. Words and settings are unchanged.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
