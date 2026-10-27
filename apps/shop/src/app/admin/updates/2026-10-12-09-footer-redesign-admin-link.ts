import type { AppUpdate } from "../appUpdates";

export default {
  id: "footer-redesign-admin-link",
  date: "2026-10-12",
  title: "Tidier footer with an Admin link",
  summary:
    "The shop footer has been re-spaced: the logo sits on the left, the Explore and Participate & connect groups sit together on the right, and the legal row and bottom bar now line up with the text above them. The bottom bar has a small “Admin” link that opens this dashboard. Everything is editable in Studio › Theme settings › Footer & social links: where the link groups sit, the space above, below and between them, text size, text, heading, hover and divider colours, divider lines on or off, and the Admin link on or off. Its word is in Text & labels › Footer. Click any part of the footer in the preview to adjust its spacing per device.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
