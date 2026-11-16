import type { AppUpdate } from "../appUpdates";

export default {
  id: "phone-form-bar",
  date: "2026-11-16",
  title: "Tidier forms and tabs on phones",
  summary: "On a phone, the save bar at the bottom of a form now stays one slim row when its message is short, so it no longer covers half the form. The tabs at the top of a page no longer show a grey scroll bar under them: swipe them sideways instead.",
  links: [{ label: "Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
