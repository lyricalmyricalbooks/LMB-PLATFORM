import type { AppUpdate } from "../appUpdates";

export default {
  id: "todo-link-fixes",
  date: "2026-10-25",
  title: "Safer linking between the shop and the inventory app",
  summary: "A book you unmatch on the website is no longer linked again by an old request from the inventory app. Stock waits until a newly linked book's orders have been counted. Saving matches while another change is landing now asks you to try again instead of overwriting it. If the two apps can't exchange their lists, a warning now says so above every page.",
  links: [{ label: "Open Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
