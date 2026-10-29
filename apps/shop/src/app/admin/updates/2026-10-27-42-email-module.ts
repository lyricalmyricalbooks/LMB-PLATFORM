import type { AppUpdate } from "../appUpdates";

export default {
  id: "email-module",
  date: "2026-10-27",
  title: "Every email your shop sends goes through one place",
  summary: "Maintenance only: order emails, gift cards, replies, summaries and the Gmail Check connection button now all go through one shared part of your shop's server. It still tries Gmail first, then the backup sender, records each attempt under Recent deliveries, and keeps important emails to try again later. Nothing changes on your screens or for customers.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
