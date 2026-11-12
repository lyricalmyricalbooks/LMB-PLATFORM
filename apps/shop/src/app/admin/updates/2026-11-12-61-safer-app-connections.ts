import type { AppUpdate } from "../appUpdates";

export default {
  id: "safer-app-connections",
  date: "2026-11-12",
  title: "Mailchimp, Chit Chats and Zapier are more careful",
  summary: "Mailchimp only connects the account you said yes to, starts fresh when you switch to another audience, and never misses someone who unsubscribes there. Chit Chats no longer makes a shipment twice when it answers slowly, and one order it refuses doesn't mark your whole connection as broken. In Zapier, a stock change with a reference is never counted twice.",
  links: [{ label: "Open Apps", tab: "settings", settingsTab: "apps" }],
} satisfies AppUpdate;
