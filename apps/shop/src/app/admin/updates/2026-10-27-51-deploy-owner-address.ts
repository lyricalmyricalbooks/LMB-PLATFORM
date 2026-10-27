import type { AppUpdate } from "../appUpdates";

export default {
  id: "deploy-owner-address",
  date: "2026-10-27",
  title: "Your shop's access rules now name your own address",
  summary: "Maintenance only: the rules that decide who can change your shop no longer carry a built-in owner address. Your own sign-in address is filled in each time the shop is updated, and an update without one stops instead of going out. Nothing changes in the admin.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
