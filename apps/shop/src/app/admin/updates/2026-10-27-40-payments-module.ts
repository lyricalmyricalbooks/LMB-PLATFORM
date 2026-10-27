import type { AppUpdate } from "../appUpdates";

export default {
  id: "payments-module",
  date: "2026-10-27",
  title: "Payment lookups and refunds go through one place",
  summary: "Maintenance only: when your shop's server looks up a card payment, refunds one, checks Stripe for refunds and disputes, or reads Stripe's payment messages, it now does so through one shared part of the code, using your own Stripe keys. Nothing changes on your screens or for shoppers. This makes payments easier to check, and they keep working the same way.",
  links: [{ label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
