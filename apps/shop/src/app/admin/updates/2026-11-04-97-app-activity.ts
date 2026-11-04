import type { AppUpdate } from "../appUpdates";

export default {
  id: "app-activity",
  date: "2026-11-04",
  title: "See what your apps changed",
  summary: "Settings › Apps lists every change an app made in your shop, such as marking an order sent or changing stock, newest first. Each change passes your shop's own checks first. If one was refused, you see why, so an order an app couldn't send never sits there unexplained.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
