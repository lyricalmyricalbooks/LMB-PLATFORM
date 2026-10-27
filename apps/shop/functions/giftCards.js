// Gift cards: codes, balances and the short holds that stop one balance being spent twice
// while two checkouts are open (the same idea as stockHolds.js).
//
// One admin-readable, server-written doc per card in `giftCards/{id}` where id is a hash of
// the code (the code itself is looked up by hashing what the shopper typed):
//   { code, last4, initialMinor, balanceMinor, currency: "CAD", enabled, expiresOn?, isTest?,
//     recipientEmail?, recipientName?, senderName?, message?, source: "order"|"admin",
//     orderId?, holds: { <orderId>: { minor, expiresAt } }, history: [...], createdAt, updatedAt }
// Money is held in whole cents (CAD). Paying debits the balance once (`giftCardsDebitedAt`
// on the order); a full refund puts it back once (`giftCardsRestoredAt`).
const crypto = require("crypto");
const { shopDate } = require("./paymentGuards");

const HOLD_MS = 30 * 60 * 1000; // same window as stock holds and the Stripe session
const MAX_CARDS_PER_ORDER = 5;
const MAX_HISTORY = 50;
// No 0/O/1/I: codes are read aloud and typed from emails.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newGiftCardCode() {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) raw += ALPHABET[bytes[i] % ALPHABET.length];
  return raw.match(/.{4}/g).join("-");
}

// "abcd efgh-ijkl mnop" → "ABCD-EFGH-IJKL-MNOP"; "" when it can't be a code.
function normalizeGiftCardCode(value) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 16 ? raw.match(/.{4}/g).join("-") : "";
}

function giftCardId(code) {
  const normal = normalizeGiftCardCode(code);
  return normal ? crypto.createHash("sha256").update(`gift-card:${normal}`).digest("hex").slice(0, 40) : "";
}

const last4 = code => normalizeGiftCardCode(code).slice(-4);

// Why a card can't be used right now, or null. testMode: the shop's payments are in test mode.
function giftCardProblem(card, { now = new Date(), testMode = false } = {}) {
  if (!card) return "not_found";
  if (card.enabled === false) return "disabled";
  if (card.isTest === true && !testMode) return "not_found";
  const expires = String(card.expiresOn || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < shopDate(now)) return "expired";
  if (!(Number(card.balanceMinor) > 0)) return "empty";
  return null;
}

const GIFT_CARD_MESSAGES = {
  not_found: "We couldn't find that gift card. Check the code and try again.",
  disabled: "This gift card can't be used. Please contact us.",
  expired: "This gift card has expired.",
  empty: "This gift card has no balance left.",
  held: "This gift card's balance is being used in another checkout. Try again in a few minutes.",
};

// `owner` (stockHolds.holdOwner): the same shopper's other checkout attempts never block them.
function activeHolds(holds, now, exceptOrderId, owner = "") {
  const out = {};
  for (const [orderId, hold] of Object.entries(holds || {})) {
    if (orderId === exceptOrderId) continue;
    if (!hold || Number(hold.expiresAt) <= now) continue;
    if (owner && hold.owner === owner) continue;
    out[orderId] = hold;
  }
  return out;
}

// Cents a checkout may use from this card: the balance minus other checkouts' live holds.
function availableMinor(card, orderId = "", now = Date.now(), owner = "") {
  const held = Object.values(activeHolds(card && card.holds, now, orderId, owner)).reduce((sum, hold) => sum + (Number(hold.minor) || 0), 0);
  return Math.max(0, Math.floor(Number(card && card.balanceMinor) || 0) - held);
}

// Spreads `dueMinor` over the cards in the order the shopper entered them.
// cards: [{ id, availableMinor }] → [{ id, minor }] (cards that cover nothing are dropped).
function allocateGiftCards(cards, dueMinor) {
  let left = Math.max(0, Math.floor(Number(dueMinor) || 0));
  const out = [];
  for (const card of cards || []) {
    if (!left) break;
    const minor = Math.min(left, Math.max(0, Math.floor(Number(card.availableMinor) || 0)));
    if (minor > 0) {
      out.push({ id: card.id, minor });
      left -= minor;
    }
  }
  return out;
}

const historyEntry = (type, minor, extra = {}) => ({ type, minor, at: new Date().toISOString(), ...extra });
const withHistory = (card, entry) => [...(Array.isArray(card.history) ? card.history : []), entry].slice(-MAX_HISTORY);

class GiftCardError extends Error {
  constructor(code) {
    super(GIFT_CARD_MESSAGES[code] || GIFT_CARD_MESSAGES.not_found);
    this.code = `gift_card_${code}`;
  }
}

// Holds each redemption's amount on its card for HOLD_MS (renewing this order's own hold).
// redemptions: [{ id, minor }]. Throws GiftCardError when a card can no longer cover it.
async function reserveGiftCards(db, orderId, redemptions, { now = Date.now(), testMode = false, owner = "" } = {}) {
  const list = (redemptions || []).filter(r => r && r.id && r.minor > 0);
  if (!list.length) return;
  await db.runTransaction(async tx => {
    const refs = list.map(r => db.collection("giftCards").doc(r.id));
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const writes = [];
    list.forEach((redemption, i) => {
      const card = snaps[i].exists ? snaps[i].data() : null;
      const problem = giftCardProblem(card, { now: new Date(now), testMode });
      if (problem) throw new GiftCardError(problem);
      if (availableMinor(card, orderId, now, owner) < redemption.minor) throw new GiftCardError("held");
      // The shopper's newer attempt replaces their earlier holds, so holds never add up past the balance.
      const others = activeHolds(card.holds, now, orderId, owner);
      writes.push([refs[i], { holds: { ...others, [orderId]: { minor: redemption.minor, expiresAt: now + HOLD_MS, ...(owner ? { owner } : {}) } }, updatedAt: new Date(now).toISOString() }]);
    });
    // update (not merge) replaces the whole holds map, so expired holds drop out.
    for (const [ref, data] of writes) tx.update(ref, data);
  });
}

// Drops the order's holds (paid elsewhere, cancelled, or the shopper retried). Best effort.
async function releaseGiftCards(db, orderId, redemptions) {
  const ids = [...new Set((redemptions || []).map(r => r && r.id).filter(Boolean))];
  if (!ids.length) return;
  try {
    await db.runTransaction(async tx => {
      const refs = ids.map(id => db.collection("giftCards").doc(id));
      const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
      snaps.forEach((snap, i) => {
        if (!snap.exists || !snap.data().holds?.[orderId]) return;
        tx.update(refs[i], { holds: activeHolds(snap.data().holds, Date.now(), orderId), updatedAt: new Date().toISOString() });
      });
    });
  } catch (err) {
    console.warn(`Could not release gift card holds for ${orderId}:`, err.message);
  }
}

// Inside a payment transaction (all reads first): read the order's cards.
async function readGiftCards(tx, db, redemptions) {
  const ids = [...new Set((redemptions || []).map(r => r && r.id).filter(Boolean))];
  const snaps = await Promise.all(ids.map(id => tx.get(db.collection("giftCards").doc(id))));
  const cards = new Map();
  snaps.forEach((snap, i) => { if (snap.exists) cards.set(ids[i], snap.data()); });
  return cards;
}

// Pure: can these cards still pay their part? Other checkouts' holds are ignored here — the
// money for this order has already arrived, so only the real balance matters.
function debitShortfall(redemptions, cards) {
  for (const r of redemptions || []) {
    if (!r || !(r.minor > 0)) continue;
    const card = cards.get(r.id);
    if (!card || card.enabled === false || Math.floor(Number(card.balanceMinor) || 0) < r.minor) return r.id;
  }
  return null;
}

// Writes the debit (or the refund credit with sign +1) and clears this order's hold.
function writeGiftCardChange(tx, db, orderId, redemptions, cards, sign, now = new Date().toISOString()) {
  for (const r of redemptions || []) {
    const card = r && cards.get(r.id);
    if (!card || !(r.minor > 0)) continue;
    const balanceMinor = Math.max(0, Math.floor(Number(card.balanceMinor) || 0) + sign * r.minor);
    const holds = { ...(card.holds || {}) };
    delete holds[orderId];
    tx.update(db.collection("giftCards").doc(r.id), {
      balanceMinor,
      holds,
      history: withHistory(card, { type: sign < 0 ? "redeemed" : "refunded", minor: r.minor, orderId, at: now }),
      updatedAt: now,
    });
  }
}

// One card per copy of each paid gift-card line. Pure: the caller writes the docs.
// lines: order.items; returns [{ id, data }] with fresh codes.
function cardsForOrder(orderId, order, { now = new Date().toISOString(), makeCode = newGiftCardCode } = {}) {
  const out = [];
  (order.items || []).forEach((item, lineIndex) => {
    if (!item || item.giftCard !== true) return;
    const minor = Math.round(Number(item.price) * 100);
    if (!(minor > 0)) return;
    const copies = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
    const details = item.giftCardDetails || {};
    for (let n = 0; n < copies; n++) {
      const code = makeCode();
      out.push({
        id: giftCardId(code),
        data: {
          code, last4: last4(code), initialMinor: minor, balanceMinor: minor, currency: "CAD", enabled: true,
          ...(order.isTest === true || order.sandboxPayment === true ? { isTest: true } : {}),
          recipientEmail: details.recipientEmail || String(order.customer?.email || "").toLowerCase(),
          recipientName: details.recipientName || "",
          senderName: details.senderName || String(order.customer?.name || ""),
          message: details.message || "",
          purchaserEmail: String(order.customer?.email || "").toLowerCase(),
          source: "order", orderId, lineIndex,
          holds: {},
          history: [{ type: "issued", minor, orderId, at: now }],
          createdAt: now, updatedAt: now,
        },
      });
    }
  });
  return out;
}

// The gift-card amounts the order's live payment was created for (saved with expectedAmountMinor).
// A later re-pricing (a retry refused because a payment is already in progress) can't change them.
function chargedRedemptions(order) {
  if (Array.isArray(order && order.chargedGiftCards)) return order.chargedGiftCards;
  return Array.isArray(order && order.giftCardRedemptions) ? order.giftCardRedemptions : [];
}

// Admin › Gift cards › Change expiry: the update for a new expiry ("" = never expires) plus its
// history line. Throws GiftCardError-style plain errors for a bad date. Pure, tested.
function expiryChange(card, value, { actor = "admin", now = new Date(), reason = "" } = {}) {
  const expiresOn = String(value ?? "").trim().slice(0, 10);
  if (expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(`${expiresOn}T12:00:00Z`)) || new Date(`${expiresOn}T12:00:00Z`).toISOString().slice(0, 10) !== expiresOn) {
      throw new Error("Use a real date for the expiry, or remove it.");
    }
    if (expiresOn < shopDate(now)) throw new Error("Choose today or a later date. To stop a card now, disable it instead.");
  }
  const previous = String(card?.expiresOn || "");
  if (previous === expiresOn) throw new Error(expiresOn ? "The card already expires on that day." : "The card already never expires.");
  const at = now.toISOString();
  const note = String(reason || "").trim().slice(0, 300);
  const text = `${expiresOn ? `Expiry set to ${expiresOn}` : "Expiry removed"}${previous ? ` (was ${previous})` : ""}${note ? `: ${note}` : ""}`;
  return {
    expiresOn,
    history: withHistory(card || {}, { type: "expiry", minor: 0, reason: text, actor, at }),
    updatedAt: at,
  };
}

module.exports = {
  expiryChange,
  chargedRedemptions,
  HOLD_MS, MAX_CARDS_PER_ORDER, GIFT_CARD_MESSAGES, GiftCardError,
  newGiftCardCode, normalizeGiftCardCode, giftCardId, last4, giftCardProblem,
  activeHolds, availableMinor, allocateGiftCards, historyEntry, withHistory,
  reserveGiftCards, releaseGiftCards, readGiftCards, debitShortfall, writeGiftCardChange, cardsForOrder,
};
