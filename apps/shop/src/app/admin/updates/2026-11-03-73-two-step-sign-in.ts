import type { AppUpdate } from "../appUpdates";

export default {
  id: "two-step-sign-in",
  date: "2026-11-03",
  title: "Two-step sign-in for your admin",
  summary: "Settings, Security lets you add a code from an authenticator app on your phone to your sign-in, so someone with your Google password still can't get in. On a paid plan it's also how you confirm changes to your plan, cards and billing details, right here in the admin.",
  links: [{ label: "Open Security", tab: "settings", settingsTab: "security" }],
} satisfies AppUpdate;
