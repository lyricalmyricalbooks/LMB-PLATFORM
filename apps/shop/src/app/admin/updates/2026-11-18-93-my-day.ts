import type { AppUpdate } from "../appUpdates";

export default {
  id: "my-day",
  date: "2026-11-18",
  title: "My day on a phone for your team",
  summary: "People with the Service provider role now see their next client first when they sign in, with last visit's note (Beta). They can check clients in, take payment with a QR code, a pay link or marked paid at the shop, and keep a note on each visit. Notes land on the client card.",
  links: [{ label: "Bookings", tab: "bookings" }, { label: "Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
