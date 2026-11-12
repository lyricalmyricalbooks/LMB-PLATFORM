import type { AppUpdate } from "../appUpdates";

export default {
  id: "till-payment-sheet",
  date: "2026-11-12",
  title: "A clearer payment sheet at the till",
  summary: "The till has one Charge button now. It opens a sheet with the total at the top: pick how they pay with one tap (Cash, Card reader, QR or Other). For cash, tap Exact, 20, 50 or 100 (or type the amount) and it shows the change to give, or what is still to pay; Charge waits until the cash covers the total. For the other ways it says what to do first, and Other records an e-transfer or a free copy.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
