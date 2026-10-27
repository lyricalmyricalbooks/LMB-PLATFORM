// Pure order-math helpers shared across Cloud Functions. Kept free of any
// firebase-admin / network dependency so it is unit-testable in isolation.

const { matchShippingZone } = require("./shared/shippingZones");

// ──────────────────────────────────────────────────────────────
// Dynamic shipping cost: highest base in the cart + per-item additional for the
// rest. Per-item shippingProfileId wins; otherwise the destination's zone
// (country > continent > legacy region > rest-of-world) sets the profile.
// ──────────────────────────────────────────────────────────────
function calculateShipping(items, customerAddress, profiles) {
  const country = (customerAddress && customerAddress.country) || "Canada";
  let highestBase = 0;
  let totalAdditional = 0;

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

  const zoneForCountry = matchShippingZone(country, profiles) || profiles[0];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const profile = profiles.find(p => p.id === item.shippingProfileId) || zoneForCountry;

    const freeThreshold = profile && profile.freeThreshold ? Number(profile.freeThreshold) : 0;
    let base = Number((profile && profile.base) || 15);
    let additional = Number((profile && profile.additional) || 5);

    if (freeThreshold > 0 && subtotal >= freeThreshold) {
      base = 0;
      additional = 0;
    }

    if (i === 0) {
      highestBase = base;
      totalAdditional += additional * (item.quantity - 1);
    } else if (base > highestBase) {
      totalAdditional += highestBase;
      highestBase = base;
      totalAdditional += additional * (item.quantity - 1);
    } else {
      totalAdditional += additional * item.quantity;
    }
  }

  return highestBase + totalAdditional;
}

// ──────────────────────────────────────────────────────────────
// Normalizes the variant stock/stockLevel duality so every paid/refund/restock
// path mutates inventory the same way. Returns the field patch to apply to the
// book document (always clamped at 0), or null when nothing should change.
//   book  : the current book data
//   item  : { variantId?, quantity }
//   delta : signed change applied to the matched stock (e.g. -qty to sell,
//           +qty to restock)
// ──────────────────────────────────────────────────────────────
function applyStockDelta(book, item, delta) {
  if (!book || !book.trackInventory) return null;
  const qty = Number(delta) || 0;
  const now = new Date().toISOString();

  if (item.variantId) {
    const variants = (book.variants || []).map(v => {
      if (v.id !== item.variantId) return v;
      const current = v.stockLevel !== undefined ? v.stockLevel : v.stock;
      const next = Math.max(0, (Number(current) || 0) + qty);
      return { ...v, stockLevel: next, stock: next };
    });
    return {
      variants,
      stockLevel: Math.max(0, (Number(book.stockLevel) || 0) + qty),
      updatedAt: now,
    };
  }

  return {
    stockLevel: Math.max(0, (Number(book.stockLevel) || 0) + qty),
    updatedAt: now,
  };
}

module.exports = { calculateShipping, applyStockDelta };
