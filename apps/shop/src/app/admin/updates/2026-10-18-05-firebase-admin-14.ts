import type { AppUpdate } from "../appUpdates";

export default {
  id: "firebase-admin-14",
  date: "2026-10-18",
  title: "The shop's server code now runs on the latest Firebase toolkit",
  summary: "The server code behind payments, emails, stock and backups now uses the newest version of Google's Firebase toolkit, which also clears the security warnings the older version carried. Nothing changes in how the shop works. Every change is still checked by loading the server code the way publishing does, so a future toolkit update that doesn't fit shows up as a failed check before it is merged.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
