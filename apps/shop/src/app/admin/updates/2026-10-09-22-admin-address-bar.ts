import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-address-bar", date: "2026-10-09", title: "The admin remembers which page you're on",
  summary: "Each admin page now has its own address, for example /admin#orders/<order>, /admin#settings/payments or /admin#customers. Reloading keeps you on the same page. The browser's Back and Forward buttons move between the pages you visited, and you can bookmark or share a page link. Back and Forward never close a book you're editing or the Design studio, so unsaved work stays put. The browser tab is now named after the page. The status pill at the top says when the shop is behind the under-construction wall instead of always saying \"Storefront live\". Turning the wall on or off now asks in the admin's own dialog. The repeated Activity Logs button is gone from each page header; it's still in the account menu (top right). Checked with local tests only.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
