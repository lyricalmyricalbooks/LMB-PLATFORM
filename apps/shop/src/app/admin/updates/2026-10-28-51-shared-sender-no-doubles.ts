import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-sender-no-doubles",
  date: "2026-10-28",
  title: "No second copies when an email to several people is tried again",
  summary: "When your shop sends one email to several people through the shared sending address and only some of them get it, trying again now reaches only the people still missing it. Nobody gets the same email twice.",
  links: [{ label: "Open Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
