// Two sending streams and each shop's own sub-address (code plan 8.3), so one shop's newsletter can't harm another
// shop's receipts. Resend's advice: a subdomain per purpose ("a password reset email carries higher priority than a
// monthly product update"), so a bad reputation stays on that subdomain; and on one account for many senders, tag every
// email with its sender, since tags come back in the delivery events (docs: knowledge-base/is-it-better-to-send-emails-
// from-a-subdomain-or-the-root-domain, knowledge-base/setting-up-resend-for-multi-tenants).
//
//   orders      receipts, order and shipping notices, sign-in links, billing: anything a person is waiting for
//   newsletter  newsletters, campaigns, back-in-stock, review requests, abandoned-cart reminders: anything sent to
//               many people that they didn't just ask for
//
// Every email is tagged with its stream either way. The sub-addresses wait on Julian's sending domain: with
// SHOP_SENDER_ADDRESSES off (the default) every email is sent from the platform's one address, as before.
//
//   SHOP_SENDER_ADDRESSES            "on": each shop sends from <shop id>@<stream's subdomain>     default off
//   PLATFORM_ORDERS_EMAIL_DOMAIN     the orders stream's subdomain                                 default mail.<domain>
//   PLATFORM_NEWSLETTER_EMAIL_DOMAIN the newsletter stream's subdomain                             default news.<domain>
// Both subdomains must be verified in Resend before the switch is turned on.

export const STREAMS = Object.freeze(["orders", "newsletter"]);

// Kinds that go to many people who didn't just ask for them. The shop door turns the shop's names into these
// (apps/shop/functions/email/platformSender.js: backInStock -> back-in-stock). A newsletter sign-up's confirmation is
// something the person just asked for, so it stays with orders.
const NEWSLETTER_KIND = /^(newsletter|campaign|marketing|broadcast|back-in-stock|review-request|abandoned-cart)(-|$)/;
const ORDERS_ANYWAY = new Set(["newsletter-confirm"]);

/** The stream an email kind belongs to. */
export const streamOf = (kind) => (NEWSLETTER_KIND.test(String(kind ?? "")) && !ORDERS_ANYWAY.has(kind) ? "newsletter" : "orders");

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** The stream settings, from the environment, on top of the platform settings (services/settings.js). */
export function streamSettings(env = process.env, settings) {
  const text = (name, fallback) => (typeof env[name] === "string" && env[name].trim() ? env[name].trim().toLowerCase() : fallback);
  const raw = text("SHOP_SENDER_ADDRESSES", "off");
  if (!["on", "off"].includes(raw)) throw new Error("SHOP_SENDER_ADDRESSES must be on or off");
  const domains = {
    orders: text("PLATFORM_ORDERS_EMAIL_DOMAIN", `mail.${settings.domain}`),
    newsletter: text("PLATFORM_NEWSLETTER_EMAIL_DOMAIN", `news.${settings.domain}`),
  };
  for (const [stream, domain] of Object.entries(domains)) {
    if (!DOMAIN.test(domain)) throw new Error(`The ${stream} email domain must be a domain like mail.colophon.example`);
  }
  if (domains.orders === domains.newsletter) throw new Error("Orders and newsletters need two different email domains");
  return { shopSenders: raw === "on", domains };
}

/**
 * The address a shop's email is sent from. Shop ids are lowercase letters, digits and hyphens (signup/form.js), so the
 * id is a valid address on its own.
 */
export function shopSenderAddress({ shopId, stream, streams, settings }) {
  if (!streams.shopSenders) return settings.senderEmail;
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(String(shopId ?? ""))) throw new Error(`${shopId} can't be an email address`);
  return `${shopId}@${streams.domains[STREAMS.includes(stream) ? stream : "orders"]}`;
}
