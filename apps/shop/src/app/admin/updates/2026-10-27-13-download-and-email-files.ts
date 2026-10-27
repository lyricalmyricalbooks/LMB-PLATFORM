import type { AppUpdate } from "../appUpdates";

export default {
  id: "download-and-email-files",
  date: "2026-10-27",
  title: "Download links and shop emails have their own files",
  summary: "Behind the scenes, the server code behind digital download links, the contact form email, the new account welcome email, message replies, the email retry queue and the test email button moved into files of their own. Downloads and these emails work exactly as before.",
  links: [{ label: "Open email settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
