// Overview › Your move so far (plan 23.20): one email to the owner when the last part of the move from the old shop is
// ticked, with what came over. Sent from the firstWeek/start trigger only on the change from "something left" to "all
// done", so a later edit to the doc (the setup guide's progress, a look chosen) sends nothing. The rules here mirror
// src/app/admin/moveProgress.ts (movingShop, moveSteps); moveDone.test.js keeps the two in step.
"use strict";

const PARTS = Object.freeze([
  ["move-books", "Books"],
  ["move-customers", "Customers"],
  ["move-giftcards", "Gift cards"],
  ["move-orders", "Past orders"],
  ["move-links", "Pages and old links"],
]);

const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A press that brought its shop with it in Get started (not one that started fresh or sold elsewhere). */
function movingShop(doc) {
  const bring = doc && doc.bring;
  return !!bring && !bring.skipped && (!bring.from || bring.from === "online" || bring.from === "marketplace");
}

/** Every part ticked. Books came over in Get started, so it counts for any moving press. */
function moveFinished(doc) {
  if (!movingShop(doc)) return false;
  const done = (doc && doc.done) || {};
  return PARTS.every(([id]) => id === "move-books" || !!done[id]);
}

/** The email, or null when this change didn't finish the move. */
function moveDoneEmail({ before, after, ownerEmail, shopName, adminLink }) {
  if (!moveFinished(after) || moveFinished(before)) return null;
  const to = String(ownerEmail || "").trim().toLowerCase();
  if (!/^[^\s@<>,]+@[^\s@<>,]+$/.test(to)) return null;
  const shop = shopName || "your shop";
  const html = [
    `<p>Everything from your old shop is now in ${esc(shop)}:</p>`,
    `<ul>${PARTS.map(([, label]) => `<li>${esc(label)}</li>`).join("")}</ul>`,
    "<p>Anything you marked as \"We had none\" is counted as done.</p>",
    "<p>Before you point your web address here, check your old links once more in Settings, General, so no old link lands on page not found.</p>",
    adminLink ? `<p><a href="${esc(adminLink)}">Open your shop's admin</a></p>` : "",
  ].join("");
  return { to: [to], subject: `Your move to ${shop} is done`, html };
}

module.exports = { PARTS, movingShop, moveFinished, moveDoneEmail };
