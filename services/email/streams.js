// Two sending streams (code plan 8.3), so a shop's newsletter can be paused without stopping its receipts.
//
//   orders      receipts, order and shipping notices, sign-in links, billing: anything a person is waiting for
//   newsletter  newsletters, campaigns, back-in-stock, review requests, abandoned-cart reminders: anything sent to
//               many people that they didn't just ask for
//
// Every email is tagged with its stream. All of them leave from the platform's one Google mailbox (gmail.js): Gmail
// sends only from that mailbox's own address, so there are no per-shop sub-addresses.

export const STREAMS = Object.freeze(["orders", "newsletter"]);

// Kinds that go to many people who didn't just ask for them. The shop door turns the shop's names into these
// (apps/shop/functions/email/platformSender.js: backInStock -> back-in-stock). A newsletter sign-up's confirmation is
// something the person just asked for, so it stays with orders.
const NEWSLETTER_KIND = /^(newsletter|campaign|marketing|broadcast|back-in-stock|review-request|abandoned-cart)(-|$)/;
const ORDERS_ANYWAY = new Set(["newsletter-confirm"]);

/** The stream an email kind belongs to. */
export const streamOf = (kind) => (NEWSLETTER_KIND.test(String(kind ?? "")) && !ORDERS_ANYWAY.has(kind) ? "newsletter" : "orders");
