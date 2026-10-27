import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-unset-colours",
  date: "2026-10-15",
  title: "Studio shows which colours and sizes you haven't set",
  summary: "In Studio, a colour you haven't chosen used to show a black square, so a section looked like it had a black background when it was really following the theme. Unset colours now show a crossed-out square with \"Not set (uses the default)\", and sliders you haven't moved say \"Default\" instead of showing their smallest number. This applies to a section's Style tab, blocks, colour schemes and Theme settings. The blue hover outline in the preview also no longer stays behind when the part under it disappears.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
