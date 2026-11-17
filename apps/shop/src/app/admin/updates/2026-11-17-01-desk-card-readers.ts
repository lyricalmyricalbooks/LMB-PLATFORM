import type { AppUpdate } from "../appUpdates";

export default {
  id: "desk-card-readers",
  date: "2026-11-17",
  title: "Card readers at the desk",
  summary: "Shops on Stripe can now take payment on a card reader that connects over the internet, such as the WisePOS E or the S700. Add the reader once on Take a payment with the code it shows. Then press Send to card reader and the client taps, inserts or swipes their card. The screen says Paid as soon as the money is in, and refunds work as for any other booking payment. Shops on Square keep the QR code for now.",
  links: [{ label: "Take a payment", tab: "takePayment" }],
} satisfies AppUpdate;
