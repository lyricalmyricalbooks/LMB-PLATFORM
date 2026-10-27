import type { AppUpdate } from "../appUpdates";

export default {
  id: "parity-check-split",
  date: "2026-10-27",
  title: "A product page check no longer fails at random",
  summary: "Maintenance only: the automatic check that your book pages' buy box still looks exactly as it should now checks each book and design on its own, instead of all 24 at once against one time limit. It checks the same things, but it no longer fails by chance when the test machine is busy, so fixes reach your shop without needless delays.",
  links: [{ label: "Open Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
