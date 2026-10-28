import type { AppUpdate } from "../appUpdates";

export default {
  id: "stripe-needs",
  date: "2026-10-28",
  title: "Payments says what Stripe still needs, and by when",
  summary: "Settings › Payments now lists what Stripe still needs from you in plain words, with its deadline, for example \"Stripe needs your bank details by 12 November\". One Continue with Stripe button opens a fresh Stripe page each time you press it. The Ready to sell check ticks itself once cards and payouts both work. If something goes past Stripe's deadline, a banner appears at the top of every admin page and Colophon emails you once.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
