import type { AppUpdate } from "../appUpdates";

export default {
  id: "native-till",
  date: "2026-11-11",
  title: "The Till, rebuilt in the admin",
  summary: "Sell in person › Till is now part of the admin itself. Tap a title to add it, then tap Cash, Card reader, QR / Stripe or Other. A sale is kept on this device at once, so if the signal drops it waits and uploads when the connection comes back. Undo takes back a wrong tap for a few seconds. Event settings names the fair for the day, and End of day lists the day's takings by payment and by title.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
