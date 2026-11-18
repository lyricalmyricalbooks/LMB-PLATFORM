import type { AppUpdate } from "../appUpdates";

export default {
  id: "rentals-deposits",
  date: "2026-11-18",
  title: "Rental deposits, late fees and pay links (Beta)",
  summary: "A rental item can ask for a deposit and a late fee. The customer's card is kept, never charged at booking for the deposit. When something comes back late or damaged, open it under Back in the last two weeks and charge a fee yourself: nothing is ever charged without your tap, and never more than the deposit. On shops that can't keep a card, send a pay link for the rest instead.",
  links: [{ label: "Rentals", tab: "rentals" }],
} satisfies AppUpdate;
