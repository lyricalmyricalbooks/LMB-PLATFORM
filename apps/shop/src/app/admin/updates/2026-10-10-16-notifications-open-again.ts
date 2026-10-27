import type { AppUpdate } from "../appUpdates";

export default {
  id: "notifications-open-again", date: "2026-10-10", title: "Notifications and Email sender open again",
  summary: "Settings › Notifications and Settings › Email sender went blank as soon as they finished loading, because of a mistake in the order the page set itself up. Both open normally again, with your saved email templates, shop alerts, Gmail sending, recent deliveries and sender details. Nothing you had saved was changed. A check now stops this kind of mistake from reaching any other admin or shop page.",
  links: [{ label: "Open Notifications", tab: "settings", settingsTab: "notifications" }, { label: "Open Email sender", tab: "settings", settingsTab: "communications" }],
} satisfies AppUpdate;
