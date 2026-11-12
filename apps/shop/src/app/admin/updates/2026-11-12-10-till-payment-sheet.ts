import type { AppUpdate } from "../appUpdates";

export default {
  id: "till-payment-sheet",
  date: "2026-11-12",
  title: "A clearer payment sheet at the till",
  summary: "Charge at the till now opens one sheet with the total at the top. Pick how they pay with one tap. For cash, tap Exact, 20, 50 or 100 (or type the amount) and it shows the change to give, or what is still to pay; Charge waits until the cash covers the total. For card, e-transfer, QR or a gift it says what to do first.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
