import type { AppUpdate } from "../appUpdates";

export default {
  id: "npm-lockfile-synced",
  date: "2026-10-17",
  title: "Behind the scenes: package list tidied after removing unused libraries",
  summary: "A companion package file was still listing the eleven unused libraries removed earlier today. It now matches, so installs on any setup agree. Nothing you see in the shop or admin changes. This is a code change only; it takes effect with the next storefront deploy.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
