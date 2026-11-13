import type { AppUpdate } from "../appUpdates";

export default {
  id: "receipts-by-email",
  date: "2026-11-13",
  title: "Receipts by email (beta)",
  summary: "Bookkeeping › Receipts has a new Receipts by email card, marked Beta. Turn it on and your shop gets its own receipts address: forward any emailed receipt or invoice to it and it is read for you (who, date, amount). It then waits on the Receipts page until you check it and add it as an expense, with the email's file kept as the receipt, or say it isn't a receipt. Nothing is added by itself. It is off until you turn it on, and the card says Opening soon until Colophon has opened it for shops.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
