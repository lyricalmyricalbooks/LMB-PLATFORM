import type { AppUpdate } from "../appUpdates";

export default {
  id: "accountant-seat",
  date: "2026-11-13",
  title: "Give your accountant their own view of the books",
  summary: "The Bookkeeper role on Settings › Team is now called Accountant, and there's an Invite your accountant button. Your accountant gets their own invitation email and, after signing in with Google, sees the books just as you do on Bookkeeping: the overview with profit and loss, every transaction, expenses, receipts with links to open them, artist payouts, and sales and tax collected, with every spreadsheet to download. They can't change anything. Receipts and exchange rates show for them after the next time you save something in the Tax centre.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
