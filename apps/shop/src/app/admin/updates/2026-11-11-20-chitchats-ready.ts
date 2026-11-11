import type { AppUpdate } from "../appUpdates";

export default {
  id: "chitchats-ready",
  date: "2026-11-11",
  title: "Chit Chats is in the app store",
  summary: "Chit Chats now lists itself in the app store, so you can add it from Settings › Apps right away. Paid orders show up in your Chit Chats account ready for postage, and only the copies still to pack are sent. Once a parcel is on its way, the order is marked sent and your customer gets the tracking.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
