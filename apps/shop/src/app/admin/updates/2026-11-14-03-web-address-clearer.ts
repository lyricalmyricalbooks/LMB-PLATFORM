import type { AppUpdate } from "../appUpdates";

export default {
  id: "web-address-clearer",
  date: "2026-11-14",
  title: "Your web address page is shorter and clearer",
  summary: "The web address page has fewer words and shorter steps. Each line to copy is one small card with a Copy button beside its name and value, coloured by whether you add it or take it out. The www address no longer repeats the instructions.",
  links: [{ label: "Your web address", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
