import type { AppUpdate } from "../appUpdates";

export default {
  id: "your-web-address",
  date: "2026-10-28",
  title: "Open your shop at your own web address",
  summary: "On a shop run by Colophon, you can now type an address you own, like shop.yourpress.com, in Settings › General. The card then lists the records to add where you bought the address and shows each step until your shop opens there with a secure padlock. Checkout works on the new address from the first visit. Apple Pay and Google Pay are switched on there once it is live. Your current address keeps working.",
  links: [{ label: "Open Your web address", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
