import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-profiles-masthead",
  date: "2026-10-22",
  title: "Shipping profiles now look like the rest of the admin",
  summary: "Opening a profile in Settings › Shipping › Profiles shows its name, then sub tabs (Zones & prices · Rules · Books · Test) and one row of numbers (zones, rates, countries, books), the same way Overview is laid out. The labels above headings, the explanations under them and the numbered steps are gone. Zones and rates have Edit plus a ⋯ menu for Copy and Delete. The profile list is one plain list with Edit and ⋯ (Duplicate, Delete), and the Create profile window shows its starting points as underlined words with no extra explanations. Nothing about how shipping is priced has changed.",
  links: [{ label: "Shipping profiles", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
