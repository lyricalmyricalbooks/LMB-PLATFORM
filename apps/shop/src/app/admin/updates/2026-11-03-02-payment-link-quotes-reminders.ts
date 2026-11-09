import type { AppUpdate } from "../appUpdates";

export default {
  id: "payment-link-quotes-reminders",
  date: "2026-11-03",
  title: "Turn a bulk-price request into a payment link, with a reminder before it closes",
  summary: "When someone asks for a bulk price from a product page, their message in Messages now has Make a payment link. It opens New order to pay with their name, email, the product, its edition and the number of copies already filled in, so you only set your price and the delivery. Two days before an unpaid link closes, the customer gets one reminder email with a Pay now button. You can change its words, or switch it off, in Settings › Notifications › Payment link reminder. One line of a link holds up to 99 copies.",
  links: [
    { label: "Open Messages", tab: "messages" },
    { label: "Open Notifications", tab: "settings", settingsTab: "notifications" },
  ],
} satisfies AppUpdate;
