import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-language-at-setup",
  date: "2026-11-03",
  title: "Choose the language of our emails while you set up",
  summary: "While you set up your shop, the General page now asks which language Colophon's emails to you should use: automatic, French or English. Automatic writes in French with the English below when your billing address is in Quebec. French emails now also write prices and plan names the French way (29,00 $, Boutique et réserve). You can change the choice later on the Plan page.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
