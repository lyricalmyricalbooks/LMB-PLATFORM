import type { AppUpdate } from "../appUpdates";

export default {
  id: "deploys-fixed-functions-check",
  date: "2026-10-18",
  title: "Shop updates go live again, and a broken server update is now caught before merging",
  summary: "An automatic security update moved the shop's server toolkit to a new major version that the shop's server code can't run on, so the last few changes stopped before reaching the live shop. The toolkit is back on the version the server code uses, and every change is now checked by loading the server code the same way publishing does, so this kind of break shows up as a failed check before it is merged instead of a failed publish afterwards.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
