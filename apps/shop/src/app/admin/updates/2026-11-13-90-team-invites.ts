import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-invites",
  date: "2026-11-13",
  title: "A Team page that does what it says",
  summary: "You now show once on Settings › Team. You can change anyone's role, remove them, send their invite again or copy their sign-in link, and see who has signed in. Every role gets an invitation email that says what they can do, and the link opens sign-in with their address ready, with a clear message if they pick the wrong Google account. Staff can no longer change card payments, Google, web addresses or apps; only owners and co-owners can.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
