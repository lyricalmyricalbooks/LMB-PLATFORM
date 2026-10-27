import type { AppUpdate } from "../appUpdates";

export default {
  id: "merchant-listing-handling-brand",
  date: "2026-10-23",
  title: "Book listings tell Google your handling time and brand",
  summary:
    "Search Console was warning that book pages left out a handling time and a brand for Google's shopping listings. Each printed book's page now tells Google how many business days you take to send a parcel (1–3 to start with) and names the book's publisher as its brand, or the shop when no publisher is filled in. Nothing changes on the page shoppers see. Change the days in Design › Text & labels › Site & sharing › Handling time on book listings. Google re-reads pages over the next days or weeks, so the warnings clear gradually; Validate fix in Search Console speeds it up.",
  links: [{ label: "Open Text & labels", tab: "settings", settingsTab: "designer", studio: "#designer?tab=text" }],
} satisfies AppUpdate;
