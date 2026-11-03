import type { AppUpdate } from "../appUpdates";

export default {
  id: "fair-till-without-a-signal",
  date: "2026-11-03",
  title: "The fair till works with no signal, inside the admin",
  summary: "If you have both the website and the stockroom, the admin now keeps a copy of itself on your device. Open the Fair till once while you have a connection, and after that the admin and the till open even with no signal at all, at a fair or a market. Your sales are saved on the device and catch up when you're back online. Your website's own pages for shoppers are unchanged.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
