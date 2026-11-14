// The shop's social accounts at the foot of the order confirmation and the shipped email: "Follow us: Instagram ·
// TikTok". Names as plain links (email programs drop SVG icons), in the owner's order (Settings › General › Social
// media), from the same rules the website uses (shared/socialLinks). Nothing when no account is filled in.
"use strict";
const { shopSocialAccounts } = require("./shared/socialLinks");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The block's HTML, or "". `website` is settings/website; `say` turns the fixed words into the email's language. */
function socialEmailSection(website, say = (text) => text) {
  const accounts = shopSocialAccounts(website || {});
  if (!accounts.length) return "";
  const links = accounts.map((a) => `<a href="${esc(a.url)}" style="color:inherit;">${esc(a.name)}</a>`).join(" &middot; ");
  return `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;">${esc(say("Follow us"))}: ${links}</p>`;
}

module.exports = { socialEmailSection };
