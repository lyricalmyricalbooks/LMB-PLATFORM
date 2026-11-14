import type { AppUpdate } from "../appUpdates";

export default {
  id: "social-media-more",
  date: "2026-11-14",
  title: "More places for your social media",
  summary: "Your social media icons now show in the phone menu too, and a new Follow us section puts them on any page you like. Use the arrows in Settings › General › Social media to choose their order. Check my links tells you when a network says one of your pages is gone. Order confirmation and shipped emails now end with your accounts.",
  links: [{ label: "Your accounts", tab: "settings", settingsTab: "general" }, { label: "Open Design", tab: "design" }],
} satisfies AppUpdate;
