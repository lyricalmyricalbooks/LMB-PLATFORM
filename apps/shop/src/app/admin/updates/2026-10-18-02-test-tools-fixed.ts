import type { AppUpdate } from "../appUpdates";

export default {
  id: "test-tools-fixed",
  date: "2026-10-18",
  title: "Automatic checks run again after a test-tool update",
  summary: "An automatic security update moved the site's test tool to a new major version that couldn't install, so every change was failing its checks. The test tool is back on its current version with the same security fix, and the automatic updates no longer jump test tools or the server toolkit to a new major version on their own. Nothing shoppers see changes.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
