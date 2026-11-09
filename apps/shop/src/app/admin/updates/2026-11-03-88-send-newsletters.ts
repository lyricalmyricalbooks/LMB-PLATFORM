import type { AppUpdate } from "../appUpdates";

export default {
  id: "send-newsletters",
  date: "2026-11-03",
  title: "Send newsletters to your mailing list",
  summary: "You can now write a newsletter and send it to everyone who confirmed they want your news, without a separate mail service. Send yourself a test first. It goes out in batches over the following minutes, the card shows how many people it has reached, and you can stop it part way. People who unsubscribed or never confirmed are left out, and every email carries an unsubscribe link.",
  links: [{ label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
