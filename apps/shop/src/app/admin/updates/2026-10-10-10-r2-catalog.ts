import type { AppUpdate } from "../appUpdates";

export default {
  id: "r2-catalog", date: "2026-10-10", title: "Books and Settings: safer saves, PayPal sandbox, email sender",
  summary: "Books: a published book keeps its web address when you edit the title, with a Change web address button (and a warning) if you really mean to; switching a gift card back to a book now sticks; a legacy book's Track inventory and Status are saved once as the editor shows them; saving an edition's stock no longer brings back copies a sale already took; a changed pre-order date also updates paid pre-orders when it comes from a CSV import; the \"scheduled to appear later\" warning follows Toronto's calendar; and the old-shop stock copy only matches exact web addresses, skips unreadable counts and books sold in editions, and lists what it skipped. Settings: PayPal test mode now uses its own Test client ID and Test client secret (the secrets are stored privately, with Remove buttons), a Resend key is checked and can be removed, Email sender (name and reply-to) has its own entry under Settings, and the Notifications page can no longer save default emails over yours when your saved ones fail to load. Deploy the Cloud Functions with this update; nothing here was tried against live PayPal or Resend.",
  links: [
    { label: "Open Books", tab: "catalog" },
    { label: "PayPal settings", tab: "settings", settingsTab: "payments" },
    { label: "Email sender", tab: "settings", settingsTab: "communications" },
  ],
} satisfies AppUpdate;
