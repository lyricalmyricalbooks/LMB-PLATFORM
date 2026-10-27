import type { AppUpdate } from "../appUpdates";

export default {
  id: "server-action-table",
  date: "2026-10-25",
  title: "The shop's server code is easier to change safely",
  summary: "The part of the server that answers admin reports (backups, the AI writing assistant, Google Analytics, Search Console, visitor journeys and the traffic reset) now lives in its own file, and the admin and lookup requests the checkout service answers are listed in one table. Nothing changes in how the admin or checkout works; it makes future server changes smaller and less likely to touch payments by accident. Takes effect once the server update is deployed.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
