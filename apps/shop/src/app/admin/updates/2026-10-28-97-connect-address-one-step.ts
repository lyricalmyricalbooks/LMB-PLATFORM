import type { AppUpdate } from "../appUpdates";

export default {
  id: "connect-address-one-step",
  date: "2026-10-28",
  title: "Connect your own web address in one step",
  summary: "Your web address card now has one Connect button. Type the address you own and press Connect. If the company you bought it from works with Colophon, you get a button that opens its own sign-in window, you say yes, and you are done. If not, you get short steps written for that company, with a Copy button on every line and a button that sends the lines to your web person. We check every few minutes and email you when your shop opens at the address. The address your shop came with keeps working all along. This works once Colophon turns on web addresses for your shop.",
  links: [{ label: "Open General settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
