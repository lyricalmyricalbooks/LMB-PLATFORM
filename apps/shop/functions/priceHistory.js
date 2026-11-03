// A book's earlier regular prices (legal review, 3 November 2026). The EU's price-indication rule (the "Omnibus"
// directive) says a sale's "was" price must be the lowest price of the 30 days before the sale, and Canada's Competition
// Act polices inflated "regular" prices the same way. Every write path changes `price` (editor, bulk edit, CSV import,
// inventory app link), so a trigger keeps the record: when the price changes, the old one is added with the moment it
// ended. The book page reads it (src/app/features/site/lowestPrice.ts) and names the lower price when there was one.
"use strict";

const KEEP_DAYS = 90;
const KEEP_ENTRIES = 12;

const priceOf = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/** The new `priceHistory` after a write, or null when the regular price didn't change (nothing to write). */
function nextPriceHistory(before, after, now = new Date()) {
  const was = priceOf(before?.price);
  const is = priceOf(after?.price);
  if (was === null || is === null || was === is) return null;
  const cutoff = now.getTime() - KEEP_DAYS * 86400000;
  const kept = (Array.isArray(after?.priceHistory) ? after.priceHistory : [])
    .filter((entry) => priceOf(entry?.price) !== null && Date.parse(entry?.until) >= cutoff);
  return [...kept, { price: was, until: now.toISOString() }].slice(-KEEP_ENTRIES);
}

module.exports = { nextPriceHistory, KEEP_DAYS, KEEP_ENTRIES };
