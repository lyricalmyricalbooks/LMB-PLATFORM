// The card on file in words, for the pages and the emails (moved out of billing.js so hub.js can share it).

const BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };

/** "Visa ending 4242", for the page and the emails. */
export function cardWords(card) {
  const brand = BRANDS[card?.brand] ?? "Card";
  return card?.last4 ? `${brand} ending ${card.last4}` : brand;
}
