import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-first-fonts",
  date: "2026-10-22",
  title: "The shop's first page asks for fewer fonts",
  summary: "Every page used to ask Google for two extra font families (Cormorant Garamond and Inter) that the default look never draws, which made the first font download larger. It now asks only for the Riso trio (Anton, Archivo, DM Mono). A different font you pick in Studio still loads on its own, exactly as before.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
