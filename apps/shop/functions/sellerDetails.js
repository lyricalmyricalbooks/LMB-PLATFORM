// The seller's details on the order confirmation (legal review, 3 November 2026). Ontario's and Quebec's consumer
// protection acts ask the seller to send the buyer a copy of the sale's terms after an online sale, with the seller's
// name, address and email and the cancellation and returns policy; EU and UK rules ask for the same "on a durable
// medium". Owners can rewrite the email's words, so this block is added by the server and is always there.
"use strict";

const { pressName, DEFAULT_SHOP_NAME } = require("./shared/shopIdentity");
const { footerAddress } = require("./marketingOptOut");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const has = (v) => typeof v === "string" && v.trim() !== "";

/** Which written policies the confirmation links to, in reading order, with their public page paths. */
const LINKED = [["returns", "Returns and cancellations"], ["shipping", "Shipping"], ["terms", "Terms of sale"], ["privacy", "Privacy"]];

/**
 * The block's HTML, or "" when there is nothing to say. `website` is settings/website; `link(path)` makes a full
 * address on the shop's site.
 */
function sellerSection(website, link, fallbackName) {
  const s = website || {};
  const named = pressName(s, fallbackName) || "";
  const name = named === DEFAULT_SHOP_NAME ? "" : named;
  const address = footerAddress(s.location);
  const email = has(s.info?.email) ? s.info.email.trim() : "";
  const policies = LINKED.filter(([key]) => has(s.policies?.[key]));
  const who = [name, address, email].filter(Boolean);
  if (!who.length && !policies.length) return "";
  const links = policies.map(([key, label]) => `<a href="${esc(link(`/page/policy-${key}`))}" style="color:inherit;">${esc(label)}</a>`).join(" &middot; ");
  return `
          <div style="margin-top:28px;padding:16px 0 0;border-top:1px solid #ddd;font-size:11px;line-height:1.6;color:#555;">
            ${who.length ? `<p style="margin:0 0 6px;">Sold by ${who.map(esc).join(", ")}.</p>` : ""}
            ${policies.length ? `<p style="margin:0;">Keep this email as your record of the sale. ${links}</p>` : ""}
          </div>`;
}

/** Checkout's order-history words (src/app/features/site/digitalConsent.ts) for an EU/EEA/UK download consent. */
const DIGITAL_CONSENT_NOTE = "Shopper asked for the digital items to be available straight away and agreed that this ends their 14-day right to cancel them.";

/**
 * The confirmation's record of that consent, or "" without one. EU and UK rules ask the seller to confirm it on a
 * durable medium, and the email is that record.
 */
function digitalConsentSection(order) {
  const agreed = Array.isArray(order?.activity) && order.activity.some((entry) => entry?.message === DIGITAL_CONSENT_NOTE);
  return agreed ? `
          <p style="margin-top:20px;font-size:12px;line-height:1.6;">You asked for your digital items to be available straight away and agreed that this ends your 14-day right to cancel them. Your right to cancel any printed or physical items is not affected.</p>` : "";
}

module.exports = { sellerSection, digitalConsentSection, DIGITAL_CONSENT_NOTE, LINKED };
