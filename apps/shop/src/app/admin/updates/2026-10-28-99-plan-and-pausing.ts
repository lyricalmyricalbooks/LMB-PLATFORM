import type { AppUpdate } from "../appUpdates";

export default {
  id: "plan-and-pausing",
  date: "2026-10-28",
  title: "Your plan, in your admin",
  summary: "Settings › Plan shows your plan, how many free-trial days are left, your next payment and whether a card is on file. A banner says when the trial is ending or a payment didn't go through, with a button to add a card. If your plan is paused, your shop shows a short-break page and takes no orders until a card is added, then opens again within a minute. Nothing is lost: you can still sign in and download everything.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
