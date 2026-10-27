import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-controls-guard",
  date: "2026-10-16",
  title: "Studio controls are now checked automatically",
  summary: "Every change to the shop's code now runs two new automatic checks. The first changes each Studio control in a test copy of Studio and stops the change if one that used to change the preview no longer does, or if a new control was added without being checked. The second clicks every Style, Words and settings button for each part of the Home and book pages and stops the change if one opens nothing. While building this it found the Cookie banner's Style button, which opened Theme settings with nothing showing; it now lists the banner's parts to pick from.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
