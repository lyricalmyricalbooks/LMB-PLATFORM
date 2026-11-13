// The invitation each person gets when the owner adds them under Settings › Team: what they can do, the one address
// to open and which Google account to sign in with. Sent by index.js syncMemberRole when someone is added, and again
// when the owner presses Send invite again (inviteRequestedAt changes). Claimed per invite in email-claims, so a re-run
// trigger never sends a second copy. Pure.
const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ADDRESS = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const msOf = v => (v && typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === "number" ? v : null);

/** True when this Team change makes someone a fair helper (added as one, or moved to it). */
function becameFairHelper(before, after) {
  return after?.role === "fairHelper" && before?.role !== "fairHelper";
}

/**
 * What a write to members/{email} means: `invite` when someone was just added or the owner asked to send the invite
 * again; `teamChanged` when someone joined, left or changed role (the platform's account switcher cares). A sign-in
 * stamp (lastSignInAt) or a new name alone is neither.
 */
function teamChange(before, after) {
  const added = !before && !!after;
  const askedAgain = !!before && !!after && msOf(after.inviteRequestedAt) !== null && msOf(after.inviteRequestedAt) !== msOf(before.inviteRequestedAt);
  return {
    invite: added || askedAgain,
    teamChanged: !before !== !after || (before?.role ?? null) !== (after?.role ?? null),
  };
}

/** Which invite this is, for its once-only claim: the time it was asked for (a re-add or Send again is a new one). */
function inviteKey(email, after) {
  const at = msOf(after?.inviteRequestedAt) ?? msOf(after?.addedAt) ?? 0;
  return `team-${String(email || "").trim().toLowerCase()}-${at}`;
}

// What each role is told it can do, and where it goes after sign-in.
const ROLE_LINES = {
  owner: { title: "a co-owner", can: "You can do everything the owner can, including adding people to the Team and changing the payment and email connections.", open: "Open the admin" },
  staff: { title: "staff", can: "You can look after orders, products, customers and the website. Payments, email connections and the Team stay with the owner.", open: "Open the admin" },
  bookkeeper: { title: "the bookkeeper", can: "You can read orders, sales, tax collected and payouts, and download them for the books. You can't change anything.", open: "Open the books" },
  author: { title: "an author", can: "In the stockroom you see and update only the books that name you as their author.", open: "Open the stockroom" },
};

/** Where the person signs in: the admin (the Fair till and the Bookkeeping page open there too) or the stockroom. */
function inviteLink(siteUrl, role, email) {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  if (!base) return "";
  if (role === "author") return `${base}/stockroom/app`;
  return `${base}/admin?invite=${encodeURIComponent(String(email || "").trim().toLowerCase())}`;
}

/** The invitation for any Team role: { to, subject, html }, or null when the address can't take mail. */
function teamInviteEmail({ email, role, shopName, siteUrl, invitedBy }) {
  const to = String(email || "").trim().toLowerCase();
  if (!ADDRESS.test(to)) return null;
  if (role === "fairHelper") return fairHelperInviteEmail({ email: to, shopName, tillLink: inviteLink(siteUrl, role, to) });
  const words = ROLE_LINES[role];
  if (!words) return null;
  const shop = String(shopName || "").trim() || "the shop";
  const link = inviteLink(siteUrl, role, to);
  const by = String(invitedBy || "").trim().toLowerCase();
  const html = [
    `<p>Hello,</p>`,
    `<p>${by && ADDRESS.test(by) ? `${esc(by)} has` : `${esc(shop)} has`} added you to ${esc(shop)}'s team as ${esc(words.title)}.</p>`,
    `<p>${esc(words.can)}</p>`,
    `<p><strong>To start</strong>, open the link below and press Sign in with Google, using the Google account for <strong>${esc(to)}</strong>. Use this same address: it's the one on the Team.</p>`,
    link ? `<p><a href="${esc(link)}">${esc(words.open)}</a><br><span style="color:#666;">${esc(link)}</span></p>` : "",
    `<p>No Google account for this address yet? You can make one for it at accounts.google.com, without a Gmail address.</p>`,
    `<p>Questions? Reply to this email to reach ${esc(shop)}.</p>`,
  ].join("");
  return { to, subject: `You're on ${shop}'s team`, html };
}

/** The fair helper's invitation: where the Fair till is and how to sign in. Replies reach the shop's own reply-to address (email/index.js). */
function fairHelperInviteEmail({ email, shopName, tillLink }) {
  const to = String(email || "").trim().toLowerCase();
  if (!ADDRESS.test(to)) return null;
  const shop = String(shopName || "").trim() || "the shop";
  const html = [
    `<p>Hello,</p>`,
    `<p>${esc(shop)} has added you as a fair helper, so you can ring up sales at their book fair table.</p>`,
    `<p><strong>To open the till</strong>, go to the address below on your phone or tablet and sign in with Google as <strong>${esc(to)}</strong>. Use this same address: the till only opens for it.</p>`,
    tillLink ? `<p><a href="${esc(tillLink)}">Open the Fair till</a><br><span style="color:#666;">${esc(tillLink)}</span></p>` : "",
    `<p>You'll see the price list and how many copies are left. Tap the books a customer buys, then how they paid. Each sale goes straight to ${esc(shop)}'s books, and a sale rung up by mistake can be undone for a short while.</p>`,
    `<p>Tip: add the page to your home screen before the fair, so it's one tap away.</p>`,
    `<p>Questions? Reply to this email to reach ${esc(shop)}.</p>`,
  ].join("");
  return { to, subject: `You're a fair helper for ${shop}`, html };
}

module.exports = { becameFairHelper, fairHelperInviteEmail, inviteKey, inviteLink, teamChange, teamInviteEmail };
