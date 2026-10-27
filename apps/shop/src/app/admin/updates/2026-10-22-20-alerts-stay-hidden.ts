import type { AppUpdate } from "../appUpdates";

export default {
  id: "alerts-stay-hidden",
  date: "2026-10-22",
  title: "Hidden alerts stay hidden",
  summary: "Closing an alert at the top of the admin used to last only until you closed that browser tab, so it came back every time you opened the admin again. Now the browser remembers it. An alert only comes back when something new happens, for example a new order joins it or the stock change waiting for you is a different one. The \"Stock for 1 book waits for you\" alert now also names the book, so you know which one to check in Inventory › Inventory app link.",
  links: [{ label: "Inventory app link", tab: "inventory" }],
} satisfies AppUpdate;
