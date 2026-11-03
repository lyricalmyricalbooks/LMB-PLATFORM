import type { AppUpdate } from "../appUpdates";

export default {
  id: "fair-helpers-round-two",
  date: "2026-11-03",
  title: "Fair helpers: undo, covers, an invitation and who sold what",
  summary: "When you add a Fair helper in Settings › Team, they now get an email with the till's address and how to sign in, and the till opens for them on their very first sign-in. Each book on their till shows its cover. A helper can undo a sale they rang up by mistake for a short while. If a helper's sale can't be added to your books (say the book was removed), it shows on your to-do list until it's sorted. On days a helper sold something, the evening fair email lists who sold what.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
