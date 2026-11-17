// GENERATED from src/shared/payWhatYouWant.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Pay what you want (Digital D2, 17 November 2026). A product with `payWhatYouWant: true` sells at its price as the
// lowest amount, and the buyer may pay more. A lowest amount of 0 makes it a free download with an optional payment.
// One rule for the shop and the server: the bag and the product page show it, `priceOrder` charges it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.payWhatYouWantMax = exports.PAY_WHAT_YOU_WANT_MAX = void 0;
exports.paysWhatTheyWant = paysWhatTheyWant;
exports.chosenUnitPrice = chosenUnitPrice;
/** The most one copy can be bought for, unless the product's own price is higher. */
exports.PAY_WHAT_YOU_WANT_MAX = 1000;
/** The product lets the buyer choose the amount: the product itself, never an edition, a box set or a gift card. */
function paysWhatTheyWant(book, variant) {
    if (!book || book.payWhatYouWant !== true || variant)
        return false;
    if (book.productType === "giftCard" || (Array.isArray(book.bundleItems) && book.bundleItems.length > 0))
        return false;
    return true;
}
/** The highest amount the buyer may type for one copy. */
const payWhatYouWantMax = (lowest) => Math.max(exports.PAY_WHAT_YOU_WANT_MAX, lowest);
exports.payWhatYouWantMax = payWhatYouWantMax;
/**
 * What one copy costs: the buyer's amount (rounded to the cent) when the product lets them choose and it is between the
 * lowest and the highest; the lowest when they typed nothing. `null` refuses the line (too little, too much, not a
 * number). A product that doesn't let the buyer choose always costs `lowest`.
 */
function chosenUnitPrice(book, variant, lowest, chosen) {
    if (!paysWhatTheyWant(book, variant))
        return lowest;
    if (chosen === undefined || chosen === null || chosen === "")
        return lowest;
    const amount = Math.round(Number(chosen) * 100) / 100;
    if (!Number.isFinite(amount) || amount < lowest - 0.0001 || amount > (0, exports.payWhatYouWantMax)(lowest))
        return null;
    return amount;
}
