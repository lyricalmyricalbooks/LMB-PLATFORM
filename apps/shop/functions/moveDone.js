// Overview › Your move so far (plan 23.20): one email to the owner when the last part of the move from the old shop is
// ticked, with what came over. Sent from the firstWeek/start trigger only on the change from "something left" to "all
// done", so a later edit to the doc (the setup guide's progress, a look chosen) sends nothing. And one reminder when a
// move stalls for a week (plan 23.26). The rules here mirror
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

/** This change is the one that finished the move. */
const justFinished = (before, after) => moveFinished(after) && !moveFinished(before);

/**
 * How much came over (plan 23.24), counted when the email goes out so a file brought twice is counted once: past orders
 * and gift cards this shop's server made from the old shop's files, and the customers on file (a moving shop's
 * customer notes are its old customers). A count that can't be read is left out.
 */
async function moveCounts(db) {
  const count = async (query) => { try { return (await query.count().get()).data().count; } catch { return null; } };
  const [customers, giftCards, orders] = await Promise.all([
    count(db.collection("customerNotes")),
    count(db.collection("giftCards").where("source", "==", "import")),
    count(db.collection("orders").where("source", "==", "import")),
  ]);
  return { "move-customers": customers, "move-giftcards": giftCards, "move-orders": orders };
}

/** "Gift cards: 2", or the label alone when there is no count (or the press had none). */
function partLine(id, label, counts) {
  const n = counts && counts[id];
  return Number.isInteger(n) && n > 0 ? `${esc(label)}: ${n.toLocaleString("en")}` : esc(label);
}

/** The email, or null when this change didn't finish the move. `counts` comes from moveCounts. */
function moveDoneEmail({ before, after, ownerEmail, shopName, adminLink, counts = null }) {
  if (!justFinished(before, after)) return null;
  const to = String(ownerEmail || "").trim().toLowerCase();
  if (!/^[^\s@<>,]+@[^\s@<>,]+$/.test(to)) return null;
  const shop = shopName || "your shop";
  const html = [
    `<p>Everything from your old shop is now in ${esc(shop)}:</p>`,
    `<ul>${PARTS.map(([id, label]) => `<li>${partLine(id, label, counts)}</li>`).join("")}</ul>`,
    "<p>Anything you marked as \"We had none\" is counted as done.</p>",
    "<p>Before you point your web address here, check your old links once more in Settings, General, so no old link lands on page not found.</p>",
    adminLink ? `<p><a href="${esc(adminLink)}">Open your shop's admin</a></p>` : "",
  ].join("");
  return { to: [to], subject: `Your move to ${shop} is done`, html };
}

const DAY = 24 * 60 * 60 * 1000;
/** A move that saw nothing new for this long gets one reminder (plan 23.26)... */
const STALL_DAYS = 7;
/** ...for this long after Get started, and no longer: a press that left it this long has decided. */
const REMIND_FOR_DAYS = 60;

/** The latest moment the move moved: Get started's answer, or the newest part ticked. */
function lastMoved(doc) {
  const times = [doc?.bring?.at, ...PARTS.map(([id]) => doc?.done?.[id])].map((t) => Date.parse(t || "")).filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * The reminder for a move that stalled (plan 23.26), with the mark to store (`systemStatus/moveReminder`), or null.
 * Once per stall: a reminder names the moment the move last moved, so another goes only after the press does
 * something and then stops again. Never once the list is put away or every part is done.
 */
function moveStallEmail({ doc, mark, now = new Date(), ownerEmail, shopName, adminLink }) {
  if (!movingShop(doc) || moveFinished(doc) || doc.done?.["move-list"]) return null;
  const last = lastMoved(doc);
  const started = Date.parse(doc.bring.at || "");
  const at = now.getTime();
  if (!Number.isFinite(last) || at - last < STALL_DAYS * DAY || (Number.isFinite(started) && at - started > REMIND_FOR_DAYS * DAY)) return null;
  const lastIso = new Date(last).toISOString();
  if (mark && mark.forLastMoved === lastIso) return null;
  const to = String(ownerEmail || "").trim().toLowerCase();
  if (!/^[^\s@<>,]+@[^\s@<>,]+$/.test(to)) return null;
  const shop = shopName || "your shop";
  const left = PARTS.filter(([id]) => id !== "move-books" && !doc.done?.[id]).map(([, label]) => label);
  const doneCount = PARTS.length - left.length;
  const html = [
    `<p>Your move to ${esc(shop)} is ${doneCount} of ${PARTS.length} done. Still to bring over:</p>`,
    `<ul>${left.map((label) => `<li>${esc(label)}</li>`).join("")}</ul>`,
    "<p>Each part takes a file from your old shop and a few minutes. If your old shop had none of something, choose \"We had none\" next to it on your Overview.</p>",
    adminLink ? `<p><a href="${esc(adminLink)}">Open your Overview</a></p>` : "",
    "<p>Don't want these? Choose \"Hide this list\" on your Overview and they stop.</p>",
  ].join("");
  return {
    message: { to: [to], subject: `Your move to ${shop}: ${doneCount} of ${PARTS.length} done`, html },
    mark: { forLastMoved: lastIso, sentAt: now.toISOString() },
  };
}

module.exports = { PARTS, movingShop, moveFinished, justFinished, moveCounts, moveDoneEmail, moveStallEmail, STALL_DAYS };
