// Bring gift cards over from the old shop (plan 23.5). Admin › Gift cards › Bring gift cards over reads the old
// shop's gift card file in the browser and sends each card here; balances are money, so only this server writes them.
//
// A card whose full code is in the file keeps that code, so holders spend it here as before (normalizeGiftCardCode
// takes 8 to 24 letters and digits). Most old shops only show the last few characters of a code; such a card gets a
// new code here, and the owner can email each holder theirs (`sendEmail`, sent by the caller after the cards exist).
//
// Safe to re-run: each card is keyed by `oldRef` (the old shop's own id for it, or its code), and a marker
// `giftCardImports/{hash of oldRef}` is created in the same transaction as the card. A second run finds the marker and
// skips the card; a kept code that is already a card here is skipped too. Every run that adds cards leaves one
// audit-log line.
"use strict";

const crypto = require("crypto");
const { shopCurrency, shopSign } = require("./shopMoney");
const { giftCardId, last4, newGiftCardCode, normalizeGiftCardCode } = require("./giftCards");
const { shopDate } = require("./paymentGuards");

const MAX_MINOR = 1000000; // 10,000 of the shop's currency, the same ceiling as an issued card
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const markerId = (oldRef) => crypto.createHash("sha256").update(`gift-card-import:${String(oldRef).trim()}`).digest("hex").slice(0, 40);

/** Why one card from the file can't come over, or "". */
function cardProblem(card, today) {
  const minor = Number(card.balanceMinor);
  if (!Number.isInteger(minor) || minor < 1) return "no balance left";
  if (minor > MAX_MINOR) return `a balance over ${shopSign()}10,000`;
  const expires = String(card.expiresOn || "").slice(0, 10);
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return "an expiry that isn't a date";
  if (expires && expires < today) return "already expired";
  if (card.code && !normalizeGiftCardCode(card.code)) return "a code this shop can't read";
  return "";
}

/**
 * Creates the cards. Answers { added: [{ id, code, kept, recipientEmail, card }], skipped: [{ oldRef, reason }] }.
 * `makeCode` is injectable for tests.
 */
async function importGiftCards(db, cards, { actor = "admin", now = new Date(), makeCode = newGiftCardCode, senderName = "" } = {}) {
  const at = now.toISOString();
  const today = shopDate(now);
  const added = [];
  const skipped = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const oldRef = String(card?.oldRef || "").trim();
    const problem = oldRef ? cardProblem(card, today) : "nothing to tell it apart";
    if (problem) { skipped.push({ oldRef, reason: problem }); continue; }
    const kept = card.code ? normalizeGiftCardCode(card.code) : "";
    const code = kept || makeCode();
    const id = giftCardId(code);
    const email = String(card.recipientEmail || "").trim().toLowerCase();
    const expires = String(card.expiresOn || "").slice(0, 10);
    const minor = Number(card.balanceMinor);
    const data = {
      code, last4: last4(code), initialMinor: minor, balanceMinor: minor, currency: shopCurrency(), enabled: true,
      ...(expires ? { expiresOn: expires } : {}),
      recipientEmail: EMAIL.test(email) ? email.slice(0, 320) : "", recipientName: String(card.recipientName || "").trim().slice(0, 100),
      senderName: String(senderName || "").slice(0, 100), message: "", note: "Brought over from your old shop",
      source: "import", importedFrom: oldRef.slice(0, 200), codeKept: !!kept, issuedBy: actor, holds: {},
      history: [{ type: "imported", minor, actor, at }], createdAt: at, updatedAt: at,
    };
    const cardRef = db.collection("giftCards").doc(id);
    const marker = db.collection("giftCardImports").doc(markerId(oldRef));
    const outcome = await db.runTransaction(async (tx) => {
      const seen = await tx.get(marker);
      const existing = await tx.get(cardRef);
      if (seen.exists) return "already brought over";
      if (existing.exists) return "a card with this code is already here";
      tx.create(cardRef, data);
      tx.create(marker, { cardId: id, at });
      return "";
    });
    if (outcome) skipped.push({ oldRef, reason: outcome });
    else added.push({ id, code, kept: !!kept, recipientEmail: data.recipientEmail, card: data });
  }
  if (added.length) {
    const total = added.reduce((sum, a) => sum + a.card.balanceMinor, 0);
    await db.collection("audit-log").add({
      type: "giftCards", message: `Brought ${added.length} gift card${added.length === 1 ? "" : "s"} over from the old shop (${shopSign()}${(total / 100).toFixed(2)} in balances)`,
      cards: added.length, balanceMinor: total, by: actor, createdAt: at,
    }).catch(() => {});
  }
  return { added, skipped };
}

module.exports = { importGiftCards, markerId };
