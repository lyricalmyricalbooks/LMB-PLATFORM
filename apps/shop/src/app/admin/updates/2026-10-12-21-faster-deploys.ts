import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-deploys",
  date: "2026-10-12",
  title: "Shop updates go live a little faster",
  summary:
    "Behind the scenes: when a change also updates the shop's server side, the shop now gets built while the server side is still deploying, instead of waiting for it first. It is still only published once the server side is live. The build also reuses its downloaded tools between runs. Expect such updates to go live about two minutes sooner. Nothing in the admin changes, and the timing will only be confirmed by the next real deploys.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
