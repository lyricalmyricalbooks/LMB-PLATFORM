import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-what-you-see", date: "2026-10-08", title: "What you see in the studio is what goes live",
  summary: "The shop now uses exactly the values the Design studio shows. Fixed along the way: your footer wordmark text now appears on every page (it was missing on Contact, About, Account and Tracking), product and custom-page headers list all your shop categories, the menu order is the same on every page, and an old \"Why choose us\" sample block that only showed above the catalog footer (and couldn't be edited) is gone. When a page keeps its own value for a setting, Theme settings now lists it under \"This page differs from all pages\", with buttons to use the all-pages value or make it the all-pages value.",
  links: [{ label: "Review page differences in Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?t=storefront&tab=style" }],
} satisfies AppUpdate;
