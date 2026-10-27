import type { AppUpdate } from "../appUpdates";

export default {
  id: "how-they-found-you",
  date: "2026-10-18",
  title: "See how each shopper found the shop",
  summary: "New orders now record where the shopper came from: the site or app (Google, Instagram, a blog…), whether it was search, social media, an ad or a direct visit, any campaign tags on the link, the referring page, the first page they saw and their device. Open an order to see it under How they found you, and the Orders CSV has Source, Medium, Campaign, ReferringPage and LandingPage columns. A visit from a link or ad is remembered for 30 days, so a shopper who comes back later by typing the address still credits it. Orders placed before this change only show the site name.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
