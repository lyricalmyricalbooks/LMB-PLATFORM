import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-move",
  date: "2026-11-17",
  title: "Events (Beta): move a guest to another date",
  summary: "When a guest can't make it, open Who's coming and press Move on their order to put their tickets on another of your events. Their ticket codes stay the same, no money changes hands, their old places go back on sale and they get an email with the new date. The move is refused in plain words when the other event doesn't have enough places. Not yet tried against a real payment account.",
  links: [{ label: "Events", tab: "events" }],
} satisfies AppUpdate;
