import type { AppUpdate } from "../appUpdates";

export default {
  id: "code-checks",
  date: "2026-10-25",
  title: "Stricter automatic checks on every change",
  summary: "Every change to the shop is now also read by a code checker and held to stricter type rules before it can go live. On its first run it found a mistake that stopped the admin opening after sign-in (already fixed). Nothing changes on screen; this catches that kind of slip before it reaches you.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
