// "Coming soon": a published book shoppers can see but not buy yet (Books › edit › Inventory ›
// Coming soon). It is never added to a bag and the server refuses it (functions/paymentGuards.js
// `purchaseProblem`, same `comingSoon === true` test). The product page shows a Coming soon button that
// opens the "email me" signup (stockAlerts); turning the switch off emails those shoppers
// (functions/index.js `onBookRestocked`). The optional Publication date is shown as "Coming <date>".
// A pre-order sells before release; a coming-soon book doesn't sell at all, so it wins when both are on.

export function comingSoonActive(book: any): boolean {
  return !!book && book.comingSoon === true;
}
