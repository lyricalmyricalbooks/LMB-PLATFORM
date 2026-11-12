import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockists-v4",
  date: "2026-11-12",
  title: "Stockists: tiles, Settle, and recent movements",
  summary: "Stockists opens with three tiles: copies out with stockists, what they've sold but not paid yet, and what was settled this year. Each stockist row shows when they last settled and one button: Settle marks their open invoice paid, Bill them starts an invoice when sales aren't billed yet, otherwise it says Up to date. Underneath, the latest copies sent, sold and returned across every stockist.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
