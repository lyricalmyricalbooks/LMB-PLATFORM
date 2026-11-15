import type { AppUpdate } from "../appUpdates";

export default {
  id: "connect-shippo",
  date: "2026-11-14",
  title: "Connect your own Shippo account for live rates and labels",
  summary: "Settings › Shipping › Carrier now has a Connect Shippo button. Sign in to your own free Shippo account and say yes once: checkout can then show carriers' live prices in the countries you pick, addresses are checked, and you can buy labels from an order. You pay postage to Shippo directly. Until Colophon's Shippo sign-in is switched on, the card says it opens soon and shoppers keep your profile prices.",
  links: [{ label: "Open Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
