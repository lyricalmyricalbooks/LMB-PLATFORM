// Parcel weights sent to Shippo, always in grams (mass_unit "g").
// A copy with no catalog weight counts as 680 g (the old 1.5 lb guess, unchanged).
const FALLBACK_COPY_GRAMS = 680;

/** Grams for one copy of an order line (`weightGrams` saved at checkout), else the fallback. */
function lineCopyGrams(item) {
  const grams = Number(item && item.weightGrams);
  return Number.isFinite(grams) && grams > 0 ? grams : FALLBACK_COPY_GRAMS;
}

/** A parcel's total as Shippo's weight string: whole grams, never below 1. */
function parcelGrams(totalGrams) {
  const g = Number(totalGrams);
  return String(Math.max(1, Math.round(Number.isFinite(g) ? g : 0)));
}

module.exports = { FALLBACK_COPY_GRAMS, lineCopyGrams, parcelGrams };
