// The invitation a fair helper gets when the owner adds them under Settings › Team (docs/combined-admin.md › Fair
// helpers plan): where the Fair till is and how to sign in. Sent once per person (index.js syncMemberRole claims it
// in email-claims, so a re-run trigger or a later edit never sends a second copy). Pure.
const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ADDRESS = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

/** True when this Team change makes someone a fair helper (added as one, or moved to it). */
function becameFairHelper(before, after) {
  return after?.role === "fairHelper" && before?.role !== "fairHelper";
}

/** The invitation: { to, subject, html }, or null when the address can't take mail. Replies reach the shop's own reply-to address (email/index.js). */
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

module.exports = { becameFairHelper, fairHelperInviteEmail };
