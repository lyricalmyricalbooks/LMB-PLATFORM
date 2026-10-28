import type { AppUpdate } from "../appUpdates";

export default {
  id: "essentials-and-menu",
  date: "2026-10-28",
  title: "A shorter admin menu, and Design opens on the essentials",
  summary: "The admin menu on the left now has five items: Home, Orders, Books, Design and Settings. Customers, discounts, gift cards and messages sit under Orders; inventory and reviews sit under Books; each appears when you open its item, with its own count of things waiting. Design now opens on Essentials: your shop's name, logo, colours, fonts and announcement bar on one short panel, with buttons to pick a ready-made look, arrange the homepage and add your About and policy pages. Every other setting is still there, under All settings in the bar on the left, and Design remembers where you were last time.",
  links: [
    { label: "Open Essentials", tab: "settings", settingsTab: "designer", studio: "designer?tab=essentials" },
  ],
} satisfies AppUpdate;
