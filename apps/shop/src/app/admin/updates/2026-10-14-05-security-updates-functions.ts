import type { AppUpdate } from "../appUpdates";

export default {
  id: "security-updates-functions",
  date: "2026-10-14",
  title: "Security updates for the shop's server code",
  summary: "The code that takes payments, sends emails and runs the shop's background jobs now uses newer versions of Firebase Admin (13.10), Firebase Functions (7.4) and Nodemailer (10.1, used for Gmail sending). That clears every high-severity security warning on it. The website also gets a patched Google networking library. All 34 server functions were loaded and tried in Firebase's local test environment, and every automatic test passed. They go live with the next Firebase deploy, which runs automatically when this change is merged. Nothing looks or works differently. The admin code checks now report zero type errors, down from 15.",
  links: [{ label: "Open Email sender settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
