import type { AppUpdate } from "../appUpdates";

export default {
  id: "install-repair",
  date: "2026-10-25",
  title: "Checks and updates run again",
  summary: "An automatic security update on 23 October put the wrong version of the page editor's text box into the shop's package list, so every check and every update of the live shop since then stopped before it started. It is back to the version the shop was built with, and the leftover file that misled the updater is gone, so the shop's changes go live again.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
