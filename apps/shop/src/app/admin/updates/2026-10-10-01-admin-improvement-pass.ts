import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-improvement-pass", date: "2026-10-10", title: "Admin improvement pass: every page",
  summary: "A review of every admin page except Design, with the fixes. Stock: the Inventory −/+ buttons and typed counts no longer undo a sale made while the page was open; rows are per edition, untracked books, gift cards and box sets are labelled, and each change records a reason with Undo. Orders: cash and e-Transfer orders can be marked paid (More order actions › Payment received — mark paid), partial refunds and partial returns work, Resend order confirmation, explanation cards for disputes and double payments, paid orders can no longer be deleted, faster loading and J/K shortcuts. Books: no false \"Unsaved changes\", a Save button that stays open, Fill from ISBN, inline price/stock edits, safer duplicate, import no longer changes stock unless asked, bulk edit. Discounts use your real shop categories and get a plain-English summary, share links that apply a code, and generated single-use codes. Gift cards, Reviews (verified purchase, pinned reviews, optional review-request email), Messages (reply from the admin), Customers (marketing consent, notes and tags, win-back of lapsed VIPs) and Overview (sales report CSV, clickable orders) all got fixes. Settings: a warning before leaving unsaved changes, Taxes in the menu with a proper editor, one Store status card where maintenance now really pauses checkout, a shipping-origin postal code, backup status and downloads, a test-sale walkthrough and a test-mode banner. Deploy the Firestore rules, indexes and Cloud Functions together with this update; nothing here was tried against the live shop yet.",
  links: [
    { label: "Open Orders", tab: "orders" },
    { label: "Open Inventory", tab: "inventory" },
    { label: "Open Settings", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
