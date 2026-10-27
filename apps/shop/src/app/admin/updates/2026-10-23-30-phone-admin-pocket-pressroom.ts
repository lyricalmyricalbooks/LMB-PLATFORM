import type { AppUpdate } from "../appUpdates";

export default {
  id: "phone-admin-pocket-pressroom",
  date: "2026-10-23",
  title: "The admin, made for your phone",
  summary: "On a phone the admin now has a slim top bar with the shop's status, a dark side menu, and lists sized for your thumb. Orders opens on To ship with a Start shipping button at the bottom. Inventory has − and + beside each book. To keep it on your home screen, open the admin in Chrome on Android and choose Install app.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
